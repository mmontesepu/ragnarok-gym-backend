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

  // ✅ NUEVO: Planificar/Actualizar semana (SYNC)
  async planWeekForStudent(userId: number, dto: PlanWeekDto) {
    const student = await this.studentsService.findByUserId(userId);

    if (!student || !student.active) {
      throw new BadRequestException('Student not found or inactive');
    }

    // Solo planes con profesor
    if (!student.plan.requiresTeacher) {
      throw new BadRequestException(
        'Este plan no usa agenda con profesor. Debes guardar días y horario en tu perfil.',
      );
    }

    if (!student.teacher || !student.fixedHour) {
      throw new BadRequestException(
        'Alumno sin profesor u horario fijo asignado',
      );
    }

    if (!dto.days || dto.days.length === 0) {
      throw new BadRequestException('Debes seleccionar al menos 1 día');
    }

    if (dto.days.length > student.plan.classesPerWeek) {
      throw new BadRequestException('Weekly limit exceeded');
    }

    // Slot fijo del alumno (profesor + hora fija)
    const slot = await this.slotsService.findByTeacherAndHour(
      student.teacher.id,
      student.fixedHour,
    );

    if (!slot) {
      throw new BadRequestException('Schedule slot not found');
    }

    // Semana LUN-SAB (tu app trabaja L-S)
    const weekStart = new Date(`${dto.weekStart}T00:00:00`);
    const monday = this.normalizeToMonday(weekStart);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);

    const from = monday.toISOString().slice(0, 10);
    const to = saturday.toISOString().slice(0, 10);

    // Fechas seleccionadas (YYYY-MM-DD)
    const selectedDates = dto.days
      .map((day) => this.resolveDate(from, day)) // from ya es lunes
      .map((d) => d); // iso date

    // Evitar duplicados si viene repetido
    const selectedSet = new Set(selectedDates);

    // Traer bookings existentes de ESA semana para ese slot fijo
    const existing = await this.bookingRepo.find({
      where: {
        student: { id: student.id },
        slot: { id: slot.id },
        date: Between(from, to),
      },
      relations: ['student', 'slot'],
    });

    const existingByDate = new Map(existing.map((b) => [b.date, b]));

    // 1) DELETE: los que existen pero ya no están seleccionados
    const toDeleteIds = existing
      .filter((b) => !selectedSet.has(b.date))
      .map((b) => b.id);

    if (toDeleteIds.length) {
      await this.bookingRepo.delete(toDeleteIds);
    }

    // 2) INSERT: los que están seleccionados pero no existen
    const toInsertDates = Array.from(selectedSet).filter(
      (d) => !existingByDate.has(d),
    );

    if (toInsertDates.length) {
      const values = toInsertDates.map((date) => ({
        student: { id: student.id },
        slot: { id: slot.id },
        date,
        status: BookingStatus.BOOKED,
      }));

      // Insert masivo (no revienta si ya existen porque filtramos antes)
      await this.bookingRepo
        .createQueryBuilder()
        .insert()
        .into(Booking)
        .values(values as any)
        .execute();
    }

    // 3) Respuesta final: devolver cómo quedó la semana
    const final = await this.bookingRepo.find({
      where: {
        student: { id: student.id },
        slot: { id: slot.id },
        date: Between(from, to),
      },
      relations: [
        'student',
        'student.user',
        'slot',
        'slot.teacher',
        'slot.teacher.user',
      ],
      order: { date: 'ASC' as any },
    });

    return {
      ok: true,
      from,
      to,
      kept: existing.filter((b) => selectedSet.has(b.date)).length,
      deleted: toDeleteIds.length,
      created: toInsertDates.length,
      items: final,
    };
  }

  // Helper: normaliza una fecha a LUNES de esa semana
  private normalizeToMonday(d: Date): Date {
    const copy = new Date(d);
    const day = copy.getDay(); // 0=Dom,1=Lun...
    const diff = (day + 6) % 7; // Lun =>0, Mar=>1,... Dom=>6
    copy.setDate(copy.getDate() - diff);
    return new Date(copy.getFullYear(), copy.getMonth(), copy.getDate());
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
