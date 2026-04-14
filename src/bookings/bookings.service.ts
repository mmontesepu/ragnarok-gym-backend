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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookingDate = new Date(`${date}T00:00:00`);

    if (bookingDate < today) {
      throw new BadRequestException('Cannot book past dates');
    }

    const student = await this.studentsService.findOne(studentId);
    if (!student || !student.active) {
      throw new BadRequestException('Student not valid');
    }

    const slot = await this.slotsService.findOne(slotId);
    if (!slot) {
      throw new BadRequestException('Schedule slot not found');
    }

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

    const booking = this.bookingRepo.create({
      student,
      slot,
      date,
      status: BookingStatus.BOOKED,
    });

    return this.bookingRepo.save(booking);
  }

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

  async planWeekForStudent(userId: number, dto: PlanWeekDto) {
    const student = await this.studentsService.findByUserId(userId);

    if (!student || !student.active) {
      throw new BadRequestException('Student not found or inactive');
    }

    if (student.plan.type !== 'PERSONALIZED') {
      throw new BadRequestException(
        'Este plan no usa agenda semanal fija con profesor.',
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

    const slot = await this.slotsService.findByTeacherAndHour(
      student.teacher.id,
      student.fixedHour,
    );

    if (!slot) {
      throw new BadRequestException('Schedule slot not found');
    }

    const weekStart = new Date(`${dto.weekStart}T00:00:00`);
    const monday = this.normalizeToMonday(weekStart);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);

    const from = monday.toISOString().slice(0, 10);
    const to = saturday.toISOString().slice(0, 10);

    const selectedDates = dto.days.map((day) => this.resolveDate(from, day));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const date of selectedDates) {
      const d = new Date(`${date}T00:00:00`);

      if (d < today) {
        throw new BadRequestException(
          `No puedes agendar fechas pasadas (${date})`,
        );
      }
    }

    const selectedSet = new Set(selectedDates);

    const existing = await this.bookingRepo.find({
      where: {
        student: { id: student.id },
        slot: { id: slot.id },
        date: Between(from, to),
      },
      relations: ['student', 'slot'],
    });

    const existingByDate = new Map(existing.map((b) => [b.date, b]));

    const toDeleteIds = existing
      .filter((b) => !selectedSet.has(b.date))
      .map((b) => b.id);

    if (toDeleteIds.length) {
      await this.bookingRepo.delete(toDeleteIds);
    }

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

      await this.bookingRepo
        .createQueryBuilder()
        .insert()
        .into(Booking)
        .values(values as any)
        .execute();
    }

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

  async createClassBooking(
    userId: number,
    body: { date: string; hour: string },
  ) {
    const { date, hour } = body;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    const normalizedHour = this.normalizeHour(hour);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookingDate = new Date(`${date}T00:00:00`);
    if (bookingDate < today) {
      throw new BadRequestException('No puedes reservar fechas pasadas');
    }

    const student = await this.studentsService.findByUserId(userId);

    if (!student || !student.active) {
      throw new BadRequestException('Student not found or inactive');
    }

    if (student.plan.type !== 'CLASS') {
      throw new BadRequestException('Solo planes CLASS pueden usar esto');
    }

    if (!student.teacher) {
      throw new BadRequestException('Alumno sin profesor asignado');
    }

    const plan = student.plan;
    const teacher = student.teacher;

    // =====================================================
    // NUEVA LÓGICA:
    // Para CLASS no validamos el día exacto del plan.
    // Solo validamos que la hora elegida exista dentro de
    // las horas definidas para el plan.
    // =====================================================
    const allowedHours = [
      ...new Set(
        (plan.schedules || [])
          .map((s) => this.normalizeHour(s.hour))
          .filter(Boolean),
      ),
    ];

    if (allowedHours.length > 0 && !allowedHours.includes(normalizedHour)) {
      throw new BadRequestException(
        `Horario no válido para este plan. Horarios permitidos: ${allowedHours.join(', ')}`,
      );
    }

    console.log('📅 BOOKING DEBUG', {
      studentId: student.id,
      teacherId: teacher.id,
      date,
      hour,
      normalizedHour,
      allowedHours,
      planSchedules: plan.schedules || [],
    });

    // Debe existir el slot del profesor para esa hora
    const slot = await this.slotsService.findByTeacherAndHour(
      teacher.id,
      normalizedHour,
    );

    if (!slot) {
      console.log('❌ SLOT NO ENCONTRADO', {
        teacherId: teacher.id,
        hour: normalizedHour,
      });

      throw new BadRequestException(
        `No existe un slot del profesor para la hora ${normalizedHour}`,
      );
    }

    // Un alumno no puede reservar dos veces el mismo día
    const normalizedDate = date;

    console.log('🧪 CLASS BOOKING INPUT', {
      rawDate: date,
      normalizedDate,
      hour,
      studentId: student.id,
    });

    const existingForSameDay = await this.bookingRepo.find({
      where: {
        student: { id: student.id },
      },
      relations: ['slot'],
      order: { date: 'ASC' as any },
    });

    console.log(
      '🧪 EXISTING BOOKINGS FOR STUDENT',
      existingForSameDay.map((b) => ({
        id: b.id,
        date: b.date,
        hour: b.slot?.hour,
      })),
    );

    const existing = await this.bookingRepo.findOne({
      where: {
        student: { id: student.id },
        date: normalizedDate,
      },
    });

    console.log('🧪 EXISTING MATCH', existing);

    if (existing) {
      throw new BadRequestException('Ya tienes una clase agendada ese día');
    }

    // Validar límite semanal
    const monday = this.normalizeToMonday(new Date(`${date}T00:00:00`));
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);

    const from = monday.toISOString().slice(0, 10);
    const to = saturday.toISOString().slice(0, 10);

    const count = await this.bookingRepo.count({
      where: {
        student: { id: student.id },
        date: Between(from, to),
      },
    });

    if (count >= plan.classesPerWeek) {
      throw new BadRequestException('Límite semanal alcanzado');
    }

    const booking = this.bookingRepo.create({
      student,
      slot,
      date: normalizedDate,
      status: BookingStatus.BOOKED,
    });

    return this.bookingRepo.save(booking);
  }

  async replaceClassWeek(
    userId: number,
    body: { weekStart: string; days: { date: string; hour: string }[] },
  ) {
    const { weekStart, days } = body;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new BadRequestException('weekStart must be YYYY-MM-DD');
    }

    const student = await this.studentsService.findByUserId(userId);

    if (!student || !student.active) {
      throw new BadRequestException('Student not found or inactive');
    }

    if (student.plan.type !== 'CLASS') {
      throw new BadRequestException('Solo planes CLASS pueden usar esto');
    }

    if (!student.teacher) {
      throw new BadRequestException('Alumno sin profesor asignado');
    }

    const plan = student.plan;
    const teacher = student.teacher;

    if (!Array.isArray(days)) {
      throw new BadRequestException('days must be an array');
    }

    const monday = this.normalizeToMonday(new Date(`${weekStart}T00:00:00`));
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);

    const from = monday.toISOString().slice(0, 10);
    const to = saturday.toISOString().slice(0, 10);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);

    const allowedHours = [
      ...new Set(
        (plan.schedules || [])
          .map((s) => this.normalizeHour(s.hour))
          .filter(Boolean),
      ),
    ];

    const normalizedRequested = days.map((d) => ({
      date: d.date,
      hour: this.normalizeHour(d.hour),
    }));

    if (normalizedRequested.length > plan.classesPerWeek) {
      throw new BadRequestException('Límite semanal alcanzado');
    }

    for (const item of normalizedRequested) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        throw new BadRequestException(`Fecha inválida: ${item.date}`);
      }

      if (item.date < from || item.date > to) {
        throw new BadRequestException(
          `La fecha ${item.date} no pertenece a la semana seleccionada`,
        );
      }

      if (item.date < todayIso) {
        throw new BadRequestException(
          `No puedes modificar fechas pasadas (${item.date})`,
        );
      }

      if (allowedHours.length > 0 && !allowedHours.includes(item.hour)) {
        throw new BadRequestException(
          `Horario no válido para este plan: ${item.hour}`,
        );
      }
    }

    const requestedDates = normalizedRequested.map((d) => d.date);
    const uniqueDates = new Set(requestedDates);

    if (uniqueDates.size !== requestedDates.length) {
      throw new BadRequestException(
        'No puedes enviar dos clases para el mismo día',
      );
    }

    const existing = await this.bookingRepo.find({
      where: {
        student: { id: student.id },
        date: Between(from, to),
      },
      relations: ['slot', 'slot.teacher'],
      order: { date: 'ASC' as any },
    });

    const pastBookings = existing.filter((b) => b.date < todayIso);
    const futureBookings = existing.filter((b) => b.date >= todayIso);

    const requestedMap = new Map(
      normalizedRequested.map((d) => [d.date, d.hour]),
    );

    const toDelete = futureBookings.filter((b) => {
      const requestedHour = requestedMap.get(b.date);
      const existingHour = this.normalizeHour(b.slot?.hour || '');

      return !requestedHour || requestedHour !== existingHour;
    });

    if (toDelete.length) {
      await this.bookingRepo.delete(toDelete.map((b) => b.id));
    }

    const remainingFuture = futureBookings.filter(
      (b) => !toDelete.some((del) => del.id === b.id),
    );

    const existingMap = new Map(
      remainingFuture.map((b) => [
        b.date,
        this.normalizeHour(b.slot?.hour || ''),
      ]),
    );

    const toInsert: Array<{
      student: { id: number };
      slot: { id: number };
      date: string;
      status: BookingStatus;
    }> = [];

    for (const item of normalizedRequested) {
      const currentHour = existingMap.get(item.date);

      if (currentHour === item.hour) {
        continue;
      }

      const slot = await this.slotsService.findByTeacherAndHour(
        teacher.id,
        item.hour,
      );

      if (!slot) {
        throw new BadRequestException(
          `No existe un slot del profesor para la hora ${item.hour}`,
        );
      }

      toInsert.push({
        student: { id: student.id },
        slot: { id: slot.id },
        date: item.date,
        status: BookingStatus.BOOKED,
      });
    }

    if (toInsert.length) {
      await this.bookingRepo
        .createQueryBuilder()
        .insert()
        .into(Booking)
        .values(toInsert as any)
        .execute();
    }

    const finalItems = await this.bookingRepo.find({
      where: {
        student: { id: student.id },
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
      keptPast: pastBookings.length,
      deleted: toDelete.length,
      created: toInsert.length,
      items: finalItems,
    };
  }

  private normalizeToMonday(d: Date): Date {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = (day + 6) % 7;
    copy.setDate(copy.getDate() - diff);
    return new Date(copy.getFullYear(), copy.getMonth(), copy.getDate());
  }

  private dateToWeekDay(date: string): WeekDay {
    const d = new Date(`${date}T00:00:00`);

    const map: Record<number, WeekDay> = {
      1: WeekDay.MONDAY,
      2: WeekDay.TUESDAY,
      3: WeekDay.WEDNESDAY,
      4: WeekDay.THURSDAY,
      5: WeekDay.FRIDAY,
      6: WeekDay.SATURDAY,
    };

    const wd = map[d.getDay()];

    if (!wd) {
      throw new BadRequestException('Domingo no permitido');
    }

    return wd;
  }

  private normalizeHour(hour: string): string {
    if (!hour) return '';

    const value = hour.trim();

    // Si viene como HH:mm:ss -> lo dejamos HH:mm
    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
      return value.slice(0, 5);
    }

    // Si viene como H:mm -> lo normalizamos a HH:mm
    const parts = value.split(':');
    if (parts.length >= 2) {
      const hh = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      return `${hh}:${mm}`;
    }

    return value;
  }

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
          teacher: b.student.teacher
            ? {
                id: b.student.teacher.id,
                firstName: b.student.teacher.firstName,
                lastName: b.student.teacher.lastName,
              }
            : null,
          students: [],
        });
      }

      map.get(hour).students.push({
        bookingId: b.id,
        firstName: b.student.firstName,
        lastName: b.student.lastName,
        email: b.student.user.email,
        status: b.status,
      });
    }

    return Array.from(map.values());
  }
}
