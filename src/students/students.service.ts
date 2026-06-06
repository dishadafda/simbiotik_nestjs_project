import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../entities/student.entity';
import { CreateStudentDto } from './dto/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
  ) {}

  async create(dto: CreateStudentDto): Promise<Student> {
    const existing = await this.studentRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Student with this email already exists');
    }

    const student = this.studentRepository.create(dto);
    return this.studentRepository.save(student);
  }

  async findById(id: number): Promise<Student | null> {
    return this.studentRepository.findOne({ where: { id } });
  }
}
