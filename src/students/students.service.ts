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
import { Teacher } from '../teachers/teacher.entity';
import { WeekDay } from './week-day.enum';
import { FreeSchedule } from '../free-schedules/free-schedule.entity';
import { UpdateStudentAdminDto } from './dto/update-student-admin.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly teachersService: TeachersService,
    private readonly dataSource: DataSource, // 👈 NUEVO (CLAVE)
    @InjectRepository(FreeSchedule) // ✅ ESTE FALTABA O ESTABA MAL
    private readonly freeScheduleRepo: Repository<FreeSchedule>,
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

      let teacher: Teacher | null = null;

      // 3️⃣ VALIDACIONES SOLO SI EL PLAN REQUIERE PROFESOR
      if (plan.requiresTeacher) {
        if (!dto.teacherId || !dto.fixedHour) {
          throw new BadRequestException(
            'Este plan requiere profesor y horario',
          );
        }

        teacher = await this.teachersService.findOne(dto.teacherId);
        if (!teacher) {
          throw new BadRequestException('Teacher not found');
        }

        const count = await queryRunner.manager.count(Student, {
          where: {
            teacher: { id: dto.teacherId },
            fixedHour: dto.fixedHour,
            active: true,
          },
        });

        if (count >= 5) {
          throw new BadRequestException(
            'Este horario ya tiene el máximo de 5 alumnos',
          );
        }
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
        user: user,
        plan: plan,
        teacher: plan.requiresTeacher ? teacher : null,
        turn: dto.turn,
        fixedHour: plan.requiresTeacher ? dto.fixedHour : null,
        weekDays: plan.requiresTeacher ? null : [], // 👈 AÑADIR
        active: true,
        firstName: dto.firstName,
        lastName: dto.lastName,
      } as Partial<Student>);

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
  async findAll(search?: string) {
    const qb = this.studentRepo
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.plan', 'plan')
      .leftJoinAndSelect('student.teacher', 'teacher');

    if (search) {
      qb.andWhere(
        `(LOWER(student.firstName) ILIKE :search 
        OR LOWER(student.lastName) ILIKE :search)`,
        { search: `%${search.toLowerCase()}%` },
      );
    }

    return qb.getMany();
  }

  findOne(id: number) {
    return this.studentRepo.findOne({
      where: { id },
      relations: ['user', 'plan', 'teacher'],
    });
  }

  async toggleActive(studentId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Traer student con lo necesario para decidir qué limpiar
      const student = await queryRunner.manager.findOne(Student, {
        where: { id: studentId },
        relations: ['user', 'plan', 'teacher'],
      });

      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const willBeActive = !student.active;

      // 1) Toggle student + user
      student.active = willBeActive;

      if (student.user) {
        student.user.active = willBeActive;
        await queryRunner.manager.save(student.user);
      }

      // 2) Si se está BLOQUEANDO → limpiar “ocupación”
      if (!willBeActive) {
        const todayIso = new Date().toISOString().slice(0, 10);

        // 2A) Borrar bookings futuros (para cualquier caso, es seguro)
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from('bookings')
          .where('"studentId" = :studentId', { studentId: student.id })
          .andWhere('"date" >= :today', { today: todayIso })
          .execute();

        // 2B) Borrar free schedule futuro (por si es plan libre)
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(FreeSchedule)
          .where('"studentId" = :studentId', { studentId: student.id })
          .andWhere('"date" >= :today', { today: todayIso })
          .execute();
      }

      // 3) Guardar student
      const saved = await queryRunner.manager.save(student);

      await queryRunner.commitTransaction();

      return {
        ok: true,
        studentId: saved.id,
        active: saved.active,
      };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async findByUserId(userId: number) {
    return this.studentRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'plan', 'teacher'],
    });
  }

  async updateStudentSchedule(
    userId: number,
    weekDays: WeekDay[],
    fixedHour: string,
  ) {
    const student = await this.findByUserId(userId);

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // 🔒 Solo planes SIN profesor
    if (student.plan.requiresTeacher) {
      throw new BadRequestException('Este plan no permite modificar horario');
    }

    // 🔒 Validar cantidad de días
    if (weekDays.length !== student.plan.classesPerWeek) {
      throw new BadRequestException(
        `Debes seleccionar exactamente ${student.plan.classesPerWeek} días`,
      );
    }

    student.weekDays = weekDays;
    student.fixedHour = fixedHour;

    return this.studentRepo.save(student);
  }

  async addFreeSchedule(userId: number, date: string, hour: string) {
    const student = await this.findByUserId(userId);

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.plan.requiresTeacher) {
      throw new BadRequestException('Este plan no permite agenda libre');
    }

    await this.freeScheduleRepo
      .createQueryBuilder()
      .insert()
      .into(FreeSchedule)
      .values({
        studentId: student.id, // 👈 OJO: NO pasar student
        date,
        hour,
      })
      .onConflict('("studentId","date") DO UPDATE SET "hour" = EXCLUDED."hour"')
      .execute();

    return { ok: true };
  }

  async updateFromAdmin(studentId: number, dto: UpdateStudentAdminDto) {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['user', 'plan', 'teacher'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (dto.firstName !== undefined) student.firstName = dto.firstName;
    if (dto.lastName !== undefined) student.lastName = dto.lastName;

    if (dto.planId) {
      const plan = await this.plansService.findOne(dto.planId);
      if (!plan) throw new BadRequestException('Plan not found');

      student.plan = plan;

      if (!plan.requiresTeacher) {
        student.teacher = null;
        student.fixedHour = null;
      }
    }

    if (student.plan.requiresTeacher) {
      if (dto.teacherId) {
        const teacher = await this.teachersService.findOne(dto.teacherId);
        if (!teacher) throw new BadRequestException('Teacher not found');

        student.teacher = teacher;
      }

      if (dto.fixedHour) {
        if (!student.teacher) {
          throw new BadRequestException('Student has no teacher assigned');
        }

        const count = await this.studentRepo.count({
          where: {
            teacher: { id: student.teacher.id },
            fixedHour: dto.fixedHour,
            active: true,
          },
        });

        if (count >= 5) {
          throw new BadRequestException('Horario lleno');
        }

        student.fixedHour = dto.fixedHour;
      }
    }

    if (dto.active !== undefined) {
      student.active = dto.active;

      if (student.user) {
        student.user.active = dto.active;
        await this.dataSource.getRepository(User).save(student.user);
      }
    }

    return this.studentRepo.save(student);
  }
}
