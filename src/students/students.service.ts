import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Student } from './student.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { PlansService } from '../plans/plans.service';
import { TeachersService } from '../teachers/teachers.service';
import { StudentTurn } from './student.entity';
import { CreateStudentAdminDto } from './dto/create-student-admin.dto';
import { User } from '../users/user.entity';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly teachersService: TeachersService,
    private readonly dataSource: DataSource, // 👈 NUEVO (CLAVE)
  ) {}

  // ======================================================
  // CREACIÓN NORMAL (NO ADMIN) — SE MANTIENE IGUAL
  // ======================================================
  async create(
    userId: number,
    planId: number,
    teacherId: number,
    turn: StudentTurn,
    fixedHour: string,
  ) {
    const user = await this.usersService.findOneById(userId);

    if (!user || user.role !== UserRole.STUDENT) {
      throw new BadRequestException('User is not a STUDENT');
    }

    const plan = await this.plansService.findOne(planId);
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    const teacher = await this.teachersService.findOne(teacherId);
    if (!teacher) {
      throw new BadRequestException('Teacher not found');
    }

    const student = this.studentRepo.create({
      user,
      plan,
      teacher,
      turn,
      fixedHour,
      active: true,
    });

    return this.studentRepo.save(student);
  }

  // ======================================================
  // CREACIÓN DESDE ADMIN — TRANSACCIONAL (FIX DEFINITIVO)
  // ======================================================
  async createFromAdmin(dto: CreateStudentAdminDto) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1️⃣ VALIDAR EMAIL ÚNICO
      const existingUser = await queryRunner.manager.findOne(User, {
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new BadRequestException('Ya existe un usuario con ese email');
      }

      // 2️⃣ VALIDAR PLAN
      const plan = await this.plansService.findOne(dto.planId);
      if (!plan) {
        throw new BadRequestException('Plan not found');
      }

      // 3️⃣ VALIDAR PROFESOR
      const teacher = await this.teachersService.findOne(dto.teacherId);
      if (!teacher) {
        throw new BadRequestException('Teacher not found');
      }

      // 4️⃣ VALIDAR CUPO HORARIO
      const count = await queryRunner.manager.count(Student, {
        where: {
          teacher: { id: dto.teacherId },
          fixedHour: dto.fixedHour,
          active: true,
        },
      });

      if (count >= 3) {
        throw new BadRequestException(
          'Este horario ya tiene el máximo de 3 alumnos',
        );
      }

      // 5️⃣ CREAR USER (MISMA TRANSACCIÓN)
      const user = queryRunner.manager.create(User, {
        email: dto.email,
        password: dto.password,
        role: UserRole.STUDENT,
        active: true,
      });

      await queryRunner.manager.save(user);

      // 6️⃣ CREAR STUDENT (MISMA TRANSACCIÓN)
      const student = queryRunner.manager.create(Student, {
        user,
        plan,
        teacher,
        turn: dto.turn,
        fixedHour: dto.fixedHour,
        active: true,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });

      await queryRunner.manager.save(student);

      // 7️⃣ COMMIT FINAL
      await queryRunner.commitTransaction();

      return student;
    } catch (error) {
      // ❌ ROLLBACK TOTAL (NO QUEDA BASURA)
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ======================================================
  // OTROS MÉTODOS — SIN CAMBIOS
  // ======================================================
  findAll() {
    return this.studentRepo.find({
      relations: ['user', 'plan', 'teacher'],
    });
  }

  findOne(id: number) {
    return this.studentRepo.findOne({
      where: { id },
      relations: ['user', 'plan', 'teacher'],
    });
  }

  async toggleActive(studentId: number) {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    student.active = !student.active;
    return this.studentRepo.save(student);
  }

  async findByUserId(userId: number) {
    return this.studentRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'plan', 'teacher'],
    });
  }
}
