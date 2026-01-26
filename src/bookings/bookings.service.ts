import { Between } from 'typeorm';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';
import { StudentsService } from '../students/students.service';
import { ScheduleSlotsService } from '../schedule-slots/schedule-slots.service';
import { PlanWeekDto } from './dto/plan-week.dto';
import { WeekDay } from '../students/week-day.enum';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly studentsService: StudentsService,
    private readonly slotsService: ScheduleSlotsService,
  ) {}

  async create(studentId: number, slotId: number, date: string) {
    const student = await this.studentsService.findOne(studentId);
    if (!student || !student.active) {
      throw new BadRequestException('Student not valid');
    }

    const slot = await this.slotsService.findOne(slotId);
    if (!slot) {
      throw new BadRequestException('Schedule slot not found');
    }

    // 🔒 DUPLICADO MISMO DÍA
    const existingBooking = await this.bookingRepo.findOne({
      where: {
        student: { id: studentId },
        slot: { id: slotId },
        date,
      },
    });

    if (existingBooking) {
      throw new BadRequestException(
        'Student already has a booking for this day',
      );
    }

    // 🔒 VALIDAR PLAN SEMANAL
    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const bookingsThisWeek = await this.bookingRepo.count({
      where: {
        student: { id: studentId },
        date: Between(
          startOfWeek.toISOString().slice(0, 10),
          endOfWeek.toISOString().slice(0, 10),
        ),
      },
    });

    if (bookingsThisWeek >= student.plan.classesPerWeek) {
      throw new BadRequestException('Weekly plan limit reached');
    }

    // ✅ SOLO CREAR BOOKING
    const booking = this.bookingRepo.create({
      student,
      slot,
      date,
      status: BookingStatus.BOOKED,
    });

    return this.bookingRepo.save(booking);
  }

  // ✅ EXISTENTES (para que el controller compile)
  findAll() {
    return this.bookingRepo.find({
      relations: ['student', 'student.user', 'slot', 'slot.teacher'],
    });
  }

  async markAttended(bookingId: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new BadRequestException('Booking not found');
    }

    booking.status = BookingStatus.ATTENDED;
    return this.bookingRepo.save(booking);
  }

  async markAbsent(bookingId: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new BadRequestException('Booking not found');
    }

    booking.status = BookingStatus.ABSENT;
    return this.bookingRepo.save(booking);
  }

  // ✅ NUEVO: Planificar semana
  async planWeekForStudent(userId: number, dto: PlanWeekDto) {
    const student = await this.studentsService.findByUserId(userId);

    if (!student || !student.active) {
      throw new BadRequestException('Student not found or inactive');
    }

    if (dto.days.length > student.plan.classesPerWeek) {
      throw new BadRequestException('Weekly limit exceeded');
    }

    const created: Booking[] = [];

    for (const day of dto.days) {
      const date = this.resolveDate(dto.weekStart, day);

      const slot = await this.slotsService.findByTeacherAndHour(
        student.teacher.id,
        student.fixedHour,
      );

      if (!slot) {
        throw new BadRequestException('Schedule slot not found');
      }

      const booking = await this.create(student.id, slot.id, date);
      created.push(booking);
    }

    return created;
  }

  // ===== Helpers privados =====
  private resolveDate(weekStart: string, day: WeekDay): string {
    const base = new Date(weekStart);

    const map: Record<WeekDay, number> = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
      SATURDAY: 5,
    };

    const result = new Date(base);
    result.setDate(base.getDate() + map[day]);

    return result.toISOString().slice(0, 10);
  }

  async getTeacherDailySchedule(userId: number, date: string) {
    const bookings = await this.bookingRepo.find({
      where: {
        date,
        student: {
          teacher: {
            user: { id: userId },
          },
        },
      },
      relations: ['student', 'student.user', 'student.teacher', 'slot'],
      order: {
        slot: { hour: 'ASC' },
      },
    });

    const map = new Map<string, any>();

    for (const b of bookings) {
      const hour = b.slot.hour;

      if (!map.has(hour)) {
        map.set(hour, {
          hour,
          teacher: {
            id: b.student.teacher.id,
            firstName: b.student.teacher.firstName,
            lastName: b.student.teacher.lastName,
          },
          students: [],
        });
      }

      map.get(hour).students.push({
        bookingId: b.id, // 🔥 CLAVE
        firstName: b.student.firstName,
        lastName: b.student.lastName,
        email: b.student.user.email,
        status: b.status, // 🔥 CLAVE
      });
    }

    return Array.from(map.values());
  }
}
