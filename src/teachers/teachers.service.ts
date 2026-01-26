import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Teacher, TeacherTurn } from './teacher.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { Student } from '../students/student.entity';
import { ScheduleSlotsService } from '../schedule-slots/schedule-slots.service';
import { Booking } from '../bookings/booking.entity';

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
    private readonly scheduleSlotsService: ScheduleSlotsService, // 👈 NUEVO
  ) {}

  async create(
    email: string,
    firstName: string,
    lastName: string,
    turn: TeacherTurn,
  ) {
    const user = await this.usersService.create(
      email,
      '123456',
      UserRole.TEACHER,
    );

    const teacher = this.teacherRepo.create({
      user,
      firstName,
      lastName,
      turn,
    });

    const savedTeacher = await this.teacherRepo.save(teacher);

    // 🔥 GENERAR HORARIOS AUTOMÁTICOS
    await this.scheduleSlotsService.createSlotsForTeacher(savedTeacher);

    return savedTeacher;
  }

  findAll() {
    return this.teacherRepo.find({ relations: ['user'] });
  }

  findOne(id: number) {
    return this.teacherRepo.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async getMyStudents(userId: number) {
    const teacher = await this.teacherRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!teacher) {
      return [];
    }

    return this.studentRepo.find({
      where: {
        teacher: { id: teacher.id },
        active: true,
      },
      relations: ['user', 'plan'],
      order: { fixedHour: 'ASC' },
    });
  }

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

  async getStudentsByUser(userId: number) {
    const teacher = await this.teacherRepo.findOne({
      where: { user: { id: userId } },
      relations: ['students', 'students.user', 'students.plan'],
    });

    if (!teacher) {
      return [];
    }

    return teacher.students;
  }
}
