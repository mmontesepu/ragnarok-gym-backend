import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Teacher, TeacherTurn, TeacherType } from './teacher.entity';

import { UserRole } from '../users/user-role.enum';
import { Student } from '../students/student.entity';
import { ScheduleSlotsService } from '../schedule-slots/schedule-slots.service';
import { Booking } from '../bookings/booking.entity';
import { UpdateTeacherAdminDto } from './dto/update-teacher-admin.dto';
import { User } from '../users/user.entity';
import { Plan } from '../plans/plan.entity';
import { hashPassword } from '../auth/password.util';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly teacherRepo: Repository<Teacher>,

    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,

    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,

    private readonly scheduleSlotsService: ScheduleSlotsService,

    private readonly dataSource: DataSource,

    private readonly configService: ConfigService,
  ) {}

  // =====================================================
  // CREAR PROFESOR
  // =====================================================

  async create(
    email: string,
    firstName: string,
    lastName: string,
    turn: TeacherTurn,
    type: TeacherType,
    planIds?: number[],
  ) {
    // Validar tipo de profesor
    if (!Object.values(TeacherType).includes(type)) {
      throw new BadRequestException('Tipo de profesor inválido');
    }

    if (!Object.values(TeacherTurn).includes(turn)) {
      throw new BadRequestException('Turno inválido');
    }

    // Contraseña inicial configurable
    const initialPassword = this.configService.get<string>(
      'TEACHER_INITIAL_PASSWORD',
    );

    if (!initialPassword || initialPassword.length < 12) {
      throw new BadRequestException(
        'Contraseña inicial de profesores no configurada',
      );
    }

    const passwordHash = await hashPassword(initialPassword);

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedTeacher: Teacher;
    let plans: Plan[] = [];

    try {
      // =================================================
      // VALIDAR EMAIL
      // =================================================

      const existingUser = await queryRunner.manager.findOne(User, {
        where: { email },
      });

      if (existingUser) {
        throw new ConflictException('Ya existe un usuario con ese email');
      }

      // =================================================
      // VALIDAR PLANES PARA PROFESORES CLASS
      // =================================================

      if (type === TeacherType.CLASS) {
        if (!planIds || planIds.length === 0) {
          throw new BadRequestException(
            'Profesor tipo CLASS debe tener planes',
          );
        }

        const numericPlanIds = [...new Set(planIds.map((id) => Number(id)))];

        if (numericPlanIds.some((id) => !Number.isInteger(id) || id <= 0)) {
          throw new BadRequestException('planIds inválidos');
        }

        plans = await queryRunner.manager.find(Plan, {
          where: {
            id: In(numericPlanIds),
          },
          relations: ['schedules'],
        });

        if (plans.length !== numericPlanIds.length) {
          throw new BadRequestException('Uno o más planes no existen');
        }
      }

      // =================================================
      // CREAR USUARIO DENTRO DE LA TRANSACCIÓN
      // =================================================

      const user = queryRunner.manager.create(User, {
        email,
        password: passwordHash,
        role: UserRole.TEACHER,
        active: true,
      });

      await queryRunner.manager.save(User, user);

      // =================================================
      // CREAR PROFESOR
      // =================================================

      const teacher = queryRunner.manager.create(Teacher, {
        user,
        firstName,
        lastName,
        turn,
        type,
        plans: type === TeacherType.CLASS ? plans : [],
        active: true,
      });

      savedTeacher = await queryRunner.manager.save(Teacher, teacher);

      // Crear horarios dentro de la misma transacción

      if (type === TeacherType.PERSONALIZED) {
        await this.scheduleSlotsService.createSlotsForTeacher(
          savedTeacher,
          queryRunner.manager,
        );
      }

      if (type === TeacherType.CLASS) {
        await this.scheduleSlotsService.createSlotsForClassTeacher(
          savedTeacher,
          plans,
          queryRunner.manager,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }

    // =====================================================
    // CREAR SLOTS PERSONALIZED
    // =====================================================

    if (type === TeacherType.PERSONALIZED) {
      await this.scheduleSlotsService.createSlotsForTeacher(savedTeacher);
    }

    // =====================================================
    // CREAR SLOTS CLASS
    // =====================================================

    if (type === TeacherType.CLASS) {
      await this.scheduleSlotsService.createSlotsForClassTeacher(
        savedTeacher,
        plans,
      );
    }

    // =====================================================
    // NO DEVOLVER CONTRASEÑA
    // =====================================================

    const { password: _password, ...safeUser } = savedTeacher.user;

    return {
      ...savedTeacher,
      user: safeUser,
    };
  }

  // =====================================================
  // LISTAR PROFESORES
  // =====================================================

  async findAll(search?: string) {
    const qb = this.teacherRepo
      .createQueryBuilder('teacher')
      .leftJoinAndSelect('teacher.user', 'user');

    if (search) {
      qb.andWhere(
        `(LOWER(teacher.firstName) ILIKE :search
          OR LOWER(teacher.lastName) ILIKE :search
          OR LOWER(user.email) ILIKE :search)`,
        {
          search: `%${search.toLowerCase()}%`,
        },
      );
    }

    qb.orderBy('teacher.firstName', 'ASC');

    return qb.getMany();
  }

  // =====================================================
  // DETALLE PROFESOR
  // =====================================================

  findOne(id: number) {
    return this.teacherRepo.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  // =====================================================
  // EDITAR PROFESOR
  // =====================================================

  async updateFromAdmin(teacherId: number, dto: UpdateTeacherAdminDto) {
    const teacher = await this.teacherRepo.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if (dto.firstName !== undefined) {
      teacher.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      teacher.lastName = dto.lastName;
    }

    if (dto.turn !== undefined) {
      teacher.turn = dto.turn;
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.active !== undefined) {
        teacher.active = dto.active;

        if (teacher.user) {
          teacher.user.active = dto.active;

          await manager.save(User, teacher.user);
        }
      }

      return manager.save(Teacher, teacher);
    });
  }

  // =====================================================
  // BLOQUEAR / ACTIVAR
  // =====================================================

  async toggleActive(teacherId: number) {
    const teacher = await this.teacherRepo.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    return this.dataSource.transaction(async (manager) => {
      const willBeActive = !teacher.active;

      teacher.active = willBeActive;

      if (teacher.user) {
        teacher.user.active = willBeActive;

        await manager.save(User, teacher.user);
      }

      const saved = await manager.save(Teacher, teacher);

      return {
        ok: true,
        teacherId: saved.id,
        active: saved.active,
      };
    });
  }

  // =====================================================
  // ALUMNOS DEL PROFESOR
  // =====================================================

  async getMyStudents(userId: number) {
    const teacher = await this.teacherRepo.findOne({
      where: {
        user: { id: userId },
      },
      relations: ['plans'],
    });

    if (!teacher) {
      return [];
    }

    // PERSONALIZED
    if (teacher.type === TeacherType.PERSONALIZED) {
      const students = await this.studentRepo.find({
        where: {
          teacher: { id: teacher.id },
          active: true,
        },
        relations: ['user', 'plan'],
        order: {
          fixedHour: 'ASC',
        },
      });

      // El profesor no necesita consultar el RUT
      return students.map(({ rut: _rut, ...student }) => student);
    }

    // CLASS
    if (teacher.type === TeacherType.CLASS) {
      const planIds = teacher.plans.map((p) => p.id);

      if (planIds.length === 0) {
        return [];
      }

      const students = await this.studentRepo.find({
        where: {
          plan: { id: In(planIds) },
          active: true,
        },
        relations: ['user', 'plan'],
      });

      return students.map(({ rut: _rut, ...student }) => student);
    }

    return [];
  }

  // =====================================================
  // AGENDA DEL PROFESOR
  // =====================================================

  async getMySchedule(userId: number, date: string) {
    const teacher = await this.teacherRepo.findOne({
      where: {
        user: { id: userId },
      },
    });

    if (!teacher) {
      return [];
    }

    const bookings = await this.bookingRepo.find({
      where: {
        date,
        slot: {
          teacher: { id: teacher.id },
        },
      },
      relations: ['student', 'student.user', 'slot'],
    });

    const scheduleMap = new Map<string, any>();

    for (const booking of bookings) {
      const hour = booking.slot.hour;

      if (!scheduleMap.has(hour)) {
        scheduleMap.set(hour, {
          hour,
          students: [],
        });
      }

      scheduleMap.get(hour).students.push({
        firstName: booking.student.firstName,
        lastName: booking.student.lastName,
        email: booking.student.user.email,
        status: booking.status,
      });
    }

    return Array.from(scheduleMap.values()).sort((a, b) =>
      a.hour.localeCompare(b.hour),
    );
  }
}
