import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { Student } from '../entities/student.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  async enroll(dto: CreateEnrollmentDto): Promise<Enrollment> {
    const student = await this.studentRepository.findOne({
      where: { id: dto.studentId },
    });

    if (!student) {
      throw new NotFoundException(`Student with id ${dto.studentId} not found`);
    }

    const courseExists = await this.courseRepository.findOne({
      where: { id: dto.courseId },
    });

    if (!courseExists) {
      throw new NotFoundException(`Course with id ${dto.courseId} not found`);
    }

    if (!courseExists.isActive) {
      throw new BadRequestException('Course is not active for enrollment');
    }

    // Explicit duplicate check before transaction (fast-fail with clear message)
    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: {
        studentId: dto.studentId,
        courseId: dto.courseId,
      },
    });

    if (existingEnrollment) {
      throw new ConflictException(
        'Student is already enrolled in this course',
      );
    }

    // Wrap enrollment creation + counter increment in a single transaction
    // to keep enrollment records and course capacity in sync under concurrency.
    return this.dataSource.transaction(async (manager) => {
      const course = await manager.findOne(Course, {
        where: { id: dto.courseId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!course) {
        throw new NotFoundException(`Course with id ${dto.courseId} not found`);
      }

      // Business Logic 1: Reject enrollment when course is at capacity.
      if (course.currentEnrollmentCount >= course.maxCapacity) {
        throw new BadRequestException(
          `Course "${course.title}" has reached its maximum capacity of ${course.maxCapacity}`,
        );
      }

      const enrollment = manager.create(Enrollment, {
        studentId: dto.studentId,
        courseId: dto.courseId,
        enrollmentDate: new Date(),
      });

      try {
        const savedEnrollment = await manager.save(Enrollment, enrollment);

        // Atomically increment enrollment count within the same transaction.
        course.currentEnrollmentCount += 1;
        await manager.save(Course, course);

        return savedEnrollment;
      } catch (error) {
        // Business Logic 2: Unique composite index catches race-condition duplicates.
        if (
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY'
        ) {
          throw new ConflictException(
            'Student is already enrolled in this course',
          );
        }
        throw error;
      }
    });
  }
}
