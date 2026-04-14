import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Booking } from '../bookings/booking.entity';
import { Student } from '../students/student.entity';
import { WeekDay } from '../students/week-day.enum';
import { UserRole } from '../users/user-role.enum';
import { FreeSchedule } from '../free-schedules/free-schedule.entity';

type ScheduleItem = {
  date: string;
  type: 'WITH_TEACHER' | 'FREE';
  hour: string;

  studentId: number;
  studentName: string;

  teacherId: number | null;
  teacherName: string | null;

  bookingId: number | null;
  status: string | null;
};

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
    @InjectRepository(FreeSchedule)
    private readonly freeScheduleRepo: Repository<FreeSchedule>,
  ) {}

  // ======================================================
  // ENTRY POINT
  // ======================================================
  async getSchedule(
    user: { userId: number; role: string },
    params: { date?: string; from?: string; to?: string },
  ) {
    const { date, from, to } = params;

    if (date) {
      return this.getScheduleByDate(user, date);
    }

    if (from && to) {
      const result: { date: string; items: ScheduleItem[] }[] = [];

      let current = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);

      while (current <= end) {
        const d = current.toISOString().slice(0, 10);
        const dayResult = await this.getScheduleByDate(user, d);
        result.push(dayResult);
        current.setDate(current.getDate() + 1);
      }

      return result;
    }

    throw new BadRequestException('Provide date or from/to');
  }

  // ======================================================
  // PER DAY
  // ======================================================
  async getScheduleByDate(
    user: { userId: number; role: string },
    date: string,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    if (user.role === UserRole.STUDENT) {
      return this.getStudentScheduleByDate(user.userId, date);
    }

    if (user.role === UserRole.TEACHER) {
      return this.getTeacherScheduleByDate(user.userId, date);
    }

    if (user.role === UserRole.ADMIN) {
      return this.getAdminScheduleByDate(date);
    }

    throw new BadRequestException('Role not supported');
  }

  // ======================================================
  // STUDENT
  // ======================================================
  private async getStudentScheduleByDate(userId: number, date: string) {
    const student = await this.studentRepo.findOne({
      where: { user: { id: userId } },
      relations: ['plan', 'teacher', 'teacher.user', 'user'],
    });

    if (!student || !student.active) {
      throw new BadRequestException('Student not found or inactive');
    }

    const plan = student.plan;

    // ===============================
    // 🔴 PERSONALIZED
    // ===============================
    if (plan.type === 'PERSONALIZED') {
      const bookings = await this.bookingRepo.find({
        where: { date, student: { id: student.id } },
        relations: [
          'student',
          'student.user',
          'slot',
          'slot.teacher',
          'slot.teacher.user',
        ],
        order: { slot: { hour: 'ASC' } as any },
      });

      return {
        date,
        items: bookings.map((b) => this.mapBookingToItem(b, date)),
      };
    }

    // ===============================
    // 🟣 CLASS
    // ===============================
    if (plan.type === 'CLASS') {
      const bookings = await this.bookingRepo.find({
        where: { date, student: { id: student.id } },
        relations: [
          'student',
          'student.user',
          'slot',
          'slot.teacher',
          'slot.teacher.user',
        ],
        order: { slot: { hour: 'ASC' } as any },
      });

      return {
        date,
        items: bookings.map((b) => this.mapBookingToItem(b, date)),
      };
    }

    // ===============================
    // 🔵 FREE
    // ===============================
    const free = await this.freeScheduleRepo.find({
      where: {
        student: { id: student.id },
        date,
      },
    });

    const studentName =
      `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() ||
      student.user?.email ||
      '-';

    return {
      date,
      items: free.map((f) => ({
        id: f.id,
        date,
        type: 'FREE' as const,
        hour: f.hour,

        studentId: student.id,
        studentName,

        teacherId: null,
        teacherName: null,

        bookingId: null,
        status: f.status,
      })),
    };
  }

  // ======================================================
  // TEACHER
  // ======================================================
  private async getTeacherScheduleByDate(userId: number, date: string) {
    const bookings = await this.bookingRepo.find({
      where: {
        date,
        slot: { teacher: { user: { id: userId } } },
      },
      relations: [
        'student',
        'student.user',
        'slot',
        'slot.teacher',
        'slot.teacher.user',
      ],
      order: { slot: { hour: 'ASC' } as any },
    });

    return {
      date,
      items: bookings.map((b) => this.mapBookingToItem(b, date)),
    };
  }

  // ======================================================
  // ADMIN
  // ======================================================
  private async getAdminScheduleByDate(date: string) {
    const bookings = await this.bookingRepo.find({
      where: { date },
      relations: [
        'student',
        'student.user',
        'slot',
        'slot.teacher',
        'slot.teacher.user',
      ],
      order: { slot: { hour: 'ASC' } as any },
    });

    return {
      date,
      items: bookings.map((b) => this.mapBookingToItem(b, date)),
    };
  }

  // ======================================================
  // HELPERS
  // ======================================================
  private mapBookingToItem(b: Booking, date: string): ScheduleItem {
    const studentName =
      `${b.student?.firstName ?? ''} ${b.student?.lastName ?? ''}`.trim() ||
      b.student?.user?.email ||
      '-';

    const teacherName =
      `${b.slot?.teacher?.firstName ?? ''} ${b.slot?.teacher?.lastName ?? ''}`.trim() ||
      b.slot?.teacher?.user?.email ||
      '-';

    return {
      date,
      type: 'WITH_TEACHER',
      hour: b.slot?.hour ?? '-',

      studentId: b.student?.id,
      studentName,

      teacherId: b.slot?.teacher?.id ?? null,
      teacherName: b.slot?.teacher ? teacherName : null,

      bookingId: b.id ?? null,
      status: b.status ?? null,
    };
  }
}
