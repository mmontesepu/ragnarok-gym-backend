import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
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
import { hashPassword } from '../auth/password.util';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly teachersService: TeachersService,
    private readonly dataSource: DataSource,

    @InjectRepository(FreeSchedule)
    private readonly freeScheduleRepo: Repository<FreeSchedule>,
  ) {}

  // ======================================================
  // NUEVO — NORMALIZAR Y VALIDAR RUT CHILENO
  // ======================================================

  private normalizeRut(rut?: string | null): string | null {
    if (rut === undefined || rut === null) {
      return null;
    }

    if (typeof rut !== 'string') {
      throw new BadRequestException('El RUT debe ser un texto');
    }

    if (rut.trim() === '') {
      return null;
    }

    const cleanRut = rut
      .trim()
      .replace(/\./g, '')
      .replace(/-/g, '')
      .replace(/\s/g, '')
      .toUpperCase();

    // Validar estructura del RUT
    if (!/^\d{1,8}[0-9K]$/.test(cleanRut)) {
      throw new BadRequestException('Formato de RUT inválido');
    }

    const body = cleanRut.slice(0, -1).replace(/^0+/, '');

    const dv = cleanRut.slice(-1);

    if (!body) {
      throw new BadRequestException('RUT inválido');
    }

    // Validación mediante módulo 11
    let sum = 0;
    let multiplier = 2;

    for (let i = body.length - 1; i >= 0; i--) {
      sum += Number(body[i]) * multiplier;

      multiplier++;

      if (multiplier > 7) {
        multiplier = 2;
      }
    }

    const result = 11 - (sum % 11);

    const expectedDv =
      result === 11 ? '0' : result === 10 ? 'K' : String(result);

    if (dv !== expectedDv) {
      throw new BadRequestException(
        'El dígito verificador del RUT no es válido',
      );
    }

    // Formato definitivo almacenado en PostgreSQL
    return `${body}-${dv}`;
  }

  // ======================================================
  // NUEVO — CONTROL DE DUPLICIDAD DE RUT
  // ======================================================

  private handleStudentSaveError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const dbError = error.driverError as {
        code?: string;
        detail?: string;
      };

      if (dbError.code === '23505' && dbError.detail?.includes('(rut)')) {
        throw new ConflictException(
          'Ya existe un alumno registrado con ese RUT',
        );
      }
    }

    throw error;
  }

  // ======================================================
  // CREACIÓN NORMAL (NO ADMIN) — SIN CAMBIOS
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
  // CREACIÓN DESDE ADMIN — TRANSACCIONAL + RUT
  // ======================================================

  async createFromAdmin(dto: CreateStudentAdminDto) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validar email único
      const existingUser = await queryRunner.manager.findOne(User, {
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new BadRequestException('Ya existe un usuario con ese email');
      }

      // ======================================================
      // NUEVO — VALIDAR Y NORMALIZAR RUT
      // ======================================================

      const rut = this.normalizeRut(dto.rut);

      if (rut) {
        const existingStudent = await queryRunner.manager.findOne(Student, {
          where: { rut },
        });

        if (existingStudent) {
          throw new ConflictException(
            'Ya existe un alumno registrado con ese RUT',
          );
        }
      }

      // 2. Obtener plan
      const plan = await this.plansService.findOne(dto.planId);

      if (!plan) {
        throw new BadRequestException('Plan not found');
      }

      let teacher: Teacher | null = null;
      let fixedHour: string | null = null;

      // ==============================
      // PERSONALIZED
      // ==============================

      if (plan.type === 'PERSONALIZED') {
        if (!dto.teacherId || !dto.fixedHour) {
          throw new BadRequestException(
            'Personalizado requiere profesor y horario',
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
          throw new BadRequestException('Horario lleno');
        }

        fixedHour = dto.fixedHour;
      }

      // ==============================
      // CLASS
      // ==============================

      if (plan.type === 'CLASS') {
        if (!dto.teacherId) {
          throw new BadRequestException('Clases requieren profesor');
        }

        teacher = await this.teachersService.findOne(dto.teacherId);

        if (!teacher) {
          throw new BadRequestException('Teacher not found');
        }

        // No se asigna horario fijo
        fixedHour = null;
      }

      // ==============================
      // FREE
      // ==============================

      if (plan.type === 'FREE') {
        teacher = null;
        fixedHour = null;
      }

      // 3. Crear usuario
      const passwordHash = await hashPassword(dto.password);

      const user = queryRunner.manager.create(User, {
        email: dto.email,
        password: passwordHash,
        role: UserRole.STUDENT,
        active: true,
      });

      await queryRunner.manager.save(user);

      // 4. Crear alumno
      const student = queryRunner.manager.create(Student, {
        user,
        plan,
        teacher,
        turn: dto.turn,
        fixedHour,
        weekDays: null,
        active: true,
        firstName: dto.firstName,
        lastName: dto.lastName,

        // NUEVO — RUT DEL ALUMNO
        rut,
      } as any);

      await queryRunner.manager.save(student);

      await queryRunner.commitTransaction();

      const { password: _password, ...safeUser } = user;

      return {
        ...student,
        user: safeUser,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      this.handleStudentSaveError(error);
    } finally {
      await queryRunner.release();
    }
  }

  // ======================================================
  // LISTADO DE ALUMNOS + BÚSQUEDA POR RUT
  // ======================================================

  async findAll(search?: string) {
    const qb = this.studentRepo
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.plan', 'plan')
      .leftJoinAndSelect('student.teacher', 'teacher');

    if (search && search.trim()) {
      const searchValue = search.trim();

      const searchRut = searchValue
        .replace(/\./g, '')
        .replace(/-/g, '')
        .replace(/\s/g, '')
        .toUpperCase();

      if (/^\d+[0-9K]?$/.test(searchRut)) {
        qb.andWhere(
          `(
            LOWER(student.firstName) ILIKE :search
            OR LOWER(student.lastName) ILIKE :search
            OR REPLACE(student.rut, '-', '') ILIKE :searchRut
          )`,
          {
            search: `%${searchValue.toLowerCase()}%`,
            searchRut: `%${searchRut}%`,
          },
        );
      } else {
        qb.andWhere(
          `(
            LOWER(student.firstName) ILIKE :search
            OR LOWER(student.lastName) ILIKE :search
          )`,
          {
            search: `%${searchValue.toLowerCase()}%`,
          },
        );
      }
    }

    return qb.getMany();
  }

  // ======================================================
  // BUSCAR ALUMNO POR ID
  // ======================================================

  findOne(id: number) {
    return this.studentRepo.findOne({
      where: { id },
      relations: ['user', 'plan', 'teacher'],
    });
  }

  // ======================================================
  // ACTIVAR / DESACTIVAR ALUMNO — SIN CAMBIOS
  // ======================================================

  async toggleActive(studentId: number) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const student = await queryRunner.manager.findOne(Student, {
        where: { id: studentId },
        relations: ['user', 'plan', 'teacher'],
      });

      if (!student) {
        throw new NotFoundException('Student not found');
      }

      const willBeActive = !student.active;

      // 1. Actualizar estado del alumno y usuario
      student.active = willBeActive;

      if (student.user) {
        student.user.active = willBeActive;

        await queryRunner.manager.save(student.user);
      }

      // 2. Si se bloquea, limpiar ocupaciones futuras
      if (!willBeActive) {
        const todayIso = new Date().toISOString().slice(0, 10);

        // Eliminar reservas futuras
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from('bookings')
          .where('"studentId" = :studentId', {
            studentId: student.id,
          })
          .andWhere('"date" >= :today', {
            today: todayIso,
          })
          .execute();

        // Eliminar horarios libres futuros
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(FreeSchedule)
          .where('"studentId" = :studentId', {
            studentId: student.id,
          })
          .andWhere('"date" >= :today', {
            today: todayIso,
          })
          .execute();
      }

      // 3. Guardar alumno
      const saved = await queryRunner.manager.save(student);

      await queryRunner.commitTransaction();

      return {
        ok: true,
        studentId: saved.id,
        active: saved.active,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ======================================================
  // OBTENER PERFIL DEL ALUMNO
  // El RUT se devuelve automáticamente desde Student
  // ======================================================

  async findByUserId(userId: number) {
    return this.studentRepo.findOne({
      where: {
        user: { id: userId },
      },
      relations: ['user', 'plan', 'teacher'],
    });
  }

  // ======================================================
  // ACTUALIZAR AGENDA SEMANAL — SIN CAMBIOS
  // ======================================================

  async updateStudentSchedule(
    userId: number,
    weekDays: WeekDay[],
    fixedHour: string,
  ) {
    const student = await this.findByUserId(userId);

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const plan = student.plan;

    // ==============================
    // PERSONALIZED
    // ==============================

    if (plan.type === 'PERSONALIZED') {
      if (weekDays.length !== plan.classesPerWeek) {
        throw new BadRequestException(
          `Debes seleccionar ${plan.classesPerWeek} días`,
        );
      }

      // Solo guarda días, no modifica la hora
      student.weekDays = weekDays;

      return this.studentRepo.save(student);
    }

    // ==============================
    // FREE
    // ==============================

    if (plan.type === 'FREE') {
      if (!fixedHour) {
        throw new BadRequestException('Debes seleccionar horario');
      }

      if (weekDays.length !== plan.classesPerWeek) {
        throw new BadRequestException(
          `Debes seleccionar ${plan.classesPerWeek} días`,
        );
      }

      // Validar rango horario
      if (
        fixedHour < plan.weekdayStartHour ||
        fixedHour > plan.weekdayEndHour
      ) {
        throw new BadRequestException('Horario fuera de rango del plan');
      }

      student.weekDays = weekDays;
      student.fixedHour = fixedHour;

      return this.studentRepo.save(student);
    }

    // ==============================
    // CLASS
    // ==============================

    if (plan.type === 'CLASS') {
      throw new BadRequestException(
        'Este plan se agenda por clases, no por perfil',
      );
    }

    throw new BadRequestException('Tipo de plan no válido');
  }

  // ======================================================
  // AGREGAR HORARIO LIBRE — SIN CAMBIOS
  // ======================================================

  async addFreeSchedule(userId: number, date: string, hour: string) {
    const student = await this.findByUserId(userId);

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    if (student.plan.type !== 'FREE') {
      throw new BadRequestException('Solo planes FREE pueden usar esto');
    }

    const plan = student.plan;

    // Validar rango horario
    if (hour < plan.weekdayStartHour || hour > plan.weekdayEndHour) {
      throw new BadRequestException('Horario fuera de rango del plan');
    }

    await this.freeScheduleRepo
      .createQueryBuilder()
      .insert()
      .into(FreeSchedule)
      .values({
        studentId: student.id,
        date,
        hour,
      })
      .onConflict('("studentId","date") DO UPDATE SET "hour" = EXCLUDED."hour"')
      .execute();

    return { ok: true };
  }

  // ======================================================
  // ACTUALIZAR ALUMNO DESDE ADMIN + RUT
  // ======================================================

  async updateFromAdmin(studentId: number, dto: UpdateStudentAdminDto) {
    const student = await this.studentRepo.findOne({
      where: { id: studentId },
      relations: ['user', 'plan', 'teacher'],
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Actualizar nombre
    if (dto.firstName !== undefined) {
      student.firstName = dto.firstName;
    }

    // Actualizar apellido
    if (dto.lastName !== undefined) {
      student.lastName = dto.lastName;
    }

    // ======================================================
    // NUEVO — ACTUALIZAR RUT DEL ALUMNO
    // ======================================================

    if (dto.rut !== undefined) {
      const rut = this.normalizeRut(dto.rut);

      if (!rut) {
        throw new BadRequestException('Debes ingresar un RUT válido');
      }

      const existingStudent = await this.studentRepo.findOne({
        where: { rut },
      });

      if (existingStudent && existingStudent.id !== student.id) {
        throw new ConflictException(
          'Ya existe otro alumno registrado con ese RUT',
        );
      }

      student.rut = rut;
    }

    // ======================================================
    // ACTUALIZAR PLAN
    // ======================================================

    if (dto.planId) {
      const plan = await this.plansService.findOne(dto.planId);

      if (!plan) {
        throw new BadRequestException('Plan not found');
      }

      student.plan = plan;

      if (!plan.requiresTeacher) {
        student.teacher = null;
        student.fixedHour = null;
      }
    }

    // ======================================================
    // ACTUALIZAR PROFESOR Y HORARIO
    // ======================================================

    if (student.plan.requiresTeacher) {
      if (dto.teacherId) {
        const teacher = await this.teachersService.findOne(dto.teacherId);

        if (!teacher) {
          throw new BadRequestException('Teacher not found');
        }

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

    // ======================================================
    // ACTUALIZAR ESTADO Y GUARDAR
    // ======================================================

    try {
      return await this.dataSource.transaction(async (manager) => {
        if (dto.active !== undefined) {
          student.active = dto.active;

          if (student.user) {
            student.user.active = dto.active;

            await manager.save(User, student.user);
          }
        }

        return await manager.save(Student, student);
      });
    } catch (error) {
      this.handleStudentSaveError(error);
    }
  }
}
