import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Admin } from '../entities/admin.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterAdminDto } from './dto/register-admin.dto';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterAdminDto): Promise<Omit<Admin, 'password'>> {
    const existing = await this.adminRepository.findOne({
      where: { username: dto.username },
    });

    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);

    const admin = this.adminRepository.create({
      username: dto.username,
      password: hashedPassword,
    });

    const saved = await this.adminRepository.save(admin);
    const { password: _, ...result } = saved;
    return result;
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const admin = await this.adminRepository.findOne({
      where: { username: dto.username },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: admin.id, username: admin.username };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async findAllAdmins(): Promise<Omit<Admin, 'password'>[]> {
    const admins = await this.adminRepository.find({
      order: { createdAt: 'DESC' },
    });

    return admins.map(({ password: _, ...admin }) => admin);
  }
}
