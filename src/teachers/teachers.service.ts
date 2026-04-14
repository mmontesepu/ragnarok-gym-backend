import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Teacher, TeacherTurn } from './teacher.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { Student } from '../students/student.entity';
import { ScheduleSlotsService } from '../schedule-slots/schedule-slots.service';
import { Booking } from '../bookings/booking.entity';
import { UpdateTeacherAdminDto } from './dto/update-teacher-admin.dto';
import { User } from '../users/user.entity';
import { TeacherType } from './teacher.entity';
import { Plan } from '../plans/plan.entity';
import { In } from 'typeorm';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly teacherRepo: Repository<Teacher>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly usersService: UsersService,
    private readonly scheduleSlotsService: ScheduleSlotsService,
    private readonly dataSource: DataSource,
  ) {}

  // ===============================
  // 👨‍🏫 CREAR PROFESOR
  // ===============================
  async create(
    email: string,
    firstName: string,
    lastName: string,
    turn: TeacherTurn,
    type: TeacherType,
    planIds?: number[],
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await this.usersService.create(
        email,
        '123456',
        UserRole.TEACHER,
      );

      let plans: Plan[] = [];

      if (type === TeacherType.CLASS) {
        if (!planIds || planIds.length === 0) {
          throw new Error('Profesor tipo CLASS debe tener planes');
        }

        const numericPlanIds = planIds.map((id) => Number(id));

        if (numericPlanIds.some((id) => isNaN(id))) {
          throw new Error('planIds inválidos');
        }

        plans = await queryRunner.manager.find(Plan, {
          where: {
            id: In(numericPlanIds), // 🔥 ESTE ES EL FIX REAL
          },
          relations: ['schedules'],
        });
      }

      const teacher = this.teacherRepo.create({
        user,
        firstName,
        lastName,
        turn,
        type,
        plans: type === TeacherType.CLASS ? plans : [],
        active: true,
      });

      const savedTeacher = await queryRunner.manager.save(teacher);

      await queryRunner.commitTransaction();

      // IMPORTANTE:
      // PERSONALIZED crea slots por turno
      if (type === TeacherType.PERSONALIZED) {
        await this.scheduleSlotsService.createSlotsForTeacher(savedTeacher);
      }

      // IMPORTANTE:
      // CLASS crea slots desde los horarios de sus planes
      if (type === TeacherType.CLASS) {
        await this.scheduleSlotsService.createSlotsForClassTeacher(
          savedTeacher,
          plans,
        );
      }

      return savedTeacher;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===============================
  // 📋 LISTAR PROFESORES
  // ===============================
  async findAll(search?: string) {
    const qb = this.teacherRepo
      .createQueryBuilder('teacher')
      .leftJoinAndSelect('teacher.user', 'user');

    if (search) {
      qb.andWhere(
        `(LOWER(teacher.firstName) ILIKE :search
          OR LOWER(teacher.lastName) ILIKE :search
          OR LOWER(user.email) ILIKE :search)`,
        { search: `%${search.toLowerCase()}%` },
      );
    }

    qb.orderBy('teacher.firstName', 'ASC');

    return qb.getMany();
  }

  // ===============================
  // 🔍 DETALLE PROFESOR
  // ===============================
  findOne(id: number) {
    return this.teacherRepo.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  // ===============================
  // ✏️ EDITAR PROFESOR (ADMIN)
  // ===============================
  async updateFromAdmin(teacherId: number, dto: UpdateTeacherAdminDto) {
    const teacher = await this.teacherRepo.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) throw new NotFoundException('Teacher not found');

    if (dto.firstName !== undefined) teacher.firstName = dto.firstName;
    if (dto.lastName !== undefined) teacher.lastName = dto.lastName;
    if (dto.turn !== undefined) teacher.turn = dto.turn;

    if (dto.active !== undefined) {
      teacher.active = dto.active;

      if (teacher.user) {
        teacher.user.active = dto.active;
        await this.dataSource.getRepository(User).save(teacher.user);
      }
    }

    return this.teacherRepo.save(teacher);
  }

  // ===============================
  // 🚫 BLOQUEAR / ACTIVAR
  // ===============================
  async toggleActive(teacherId: number) {
    const teacher = await this.teacherRepo.findOne({
      where: { id: teacherId },
      relations: ['user'],
    });

    if (!teacher) throw new NotFoundException('Teacher not found');

    const willBeActive = !teacher.active;
    teacher.active = willBeActive;

    if (teacher.user) {
      teacher.user.active = willBeActive;
      await this.dataSource.getRepository(User).save(teacher.user);
    }

    const saved = await this.teacherRepo.save(teacher);

    return { ok: true, teacherId: saved.id, active: saved.active };
  }

  // ===============================
  // 👨‍🎓 ALUMNOS DEL PROFESOR
  // ===============================
  async getMyStudents(userId: number) {
    const teacher = await this.teacherRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!teacher) {
      return [];
    }

    return this.studentRepo.find({
      where: { teacher: { id: teacher.id }, active: true },
      relations: ['user', 'plan'],
      order: { fixedHour: 'ASC' },
    });
  }

  // ===============================
  // 📅 AGENDA DEL PROFESOR
  // ===============================
  async getMySchedule(userId: number, date: string) {
    const teacher = await this.teacherRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!teacher) {
      return [];
    }

    const bookings = await this.bookingRepo.find({
      where: {
        date,
        slot: { teacher: { id: teacher.id } },
      },
      relations: ['student', 'student.user', 'slot'],
    });

    const scheduleMap = new Map<string, any>();

    for (const booking of bookings) {
      const hour = booking.slot.hour;

      if (!scheduleMap.has(hour)) {
        scheduleMap.set(hour, { hour, students: [] });
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
