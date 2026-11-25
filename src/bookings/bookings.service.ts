import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository, DataSource, EntityManager, Between } from 'typeorm';

import { Booking, BookingStatus } from './booking.entity';

import { Student } from '../students/student.entity';

import { ScheduleSlot } from '../schedule-slots/schedule-slot.entity';

import { PlanWeekDto } from './dto/plan-week.dto';

import {
  getTodayChile,
  validateDate,
  validateHour,
  addDays,
} from '../common/utils/date.util';

type RequestedBooking = {
  date: string;
  hour: string;
};

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,

    private readonly dataSource: DataSource,
  ) {}

  // =====================================================
  // CREAR RESERVA MANUAL — ADMIN
  // =====================================================

  async create(studentId: number, slotId: number, date: string) {
    this.validateId(studentId);
    this.validateId(slotId);

    validateDate(date);

    if (date < getTodayChile()) {
      throw new BadRequestException('No puedes reservar fechas pasadas');
    }

    return this.runTransaction(async (manager) => {
      const student = await this.lockStudent(manager, studentId);

      this.validateStudent(student);

      if (student.plan.type === 'FREE') {
        throw new BadRequestException('El alumno utiliza un plan libre');
      }

      const slot = await manager.getRepository(ScheduleSlot).findOne({
        where: {
          id: slotId,
          active: true,
        },
        relations: ['teacher', 'teacher.user'],
      });

      if (!slot) {
        throw new BadRequestException('Horario no encontrado o inactivo');
      }

      this.validateSlot(student, slot);

      if (student.plan.type === 'PERSONALIZED') {
        if (
          this.normalizeHour(student.fixedHour || '') !==
          this.normalizeHour(slot.hour)
        ) {
          throw new BadRequestException('El horario no corresponde al alumno');
        }
      }

      if (student.plan.type === 'CLASS') {
        this.validateClassHour(student, this.normalizeHour(slot.hour));
      }

      return this.insertSingleBooking(manager, student, slot, date);
    });
  }

  // =====================================================
  // LISTAR RESERVAS — ADMIN
  // =====================================================

  findAll() {
    return this.bookingRepo.find({
      relations: ['student', 'student.user', 'slot', 'slot.teacher'],
    });
  }

  // =====================================================
  // MARCAR ASISTENCIA
  // =====================================================

  async markAttended(bookingId: number, userId: number) {
    return this.updateBookingAttendance(
      bookingId,
      userId,
      BookingStatus.ATTENDED,
    );
  }

  // =====================================================
  // MARCAR AUSENCIA
  // =====================================================

  async markAbsent(bookingId: number, userId: number) {
    return this.updateBookingAttendance(
      bookingId,
      userId,
      BookingStatus.ABSENT,
    );
  }

  // =====================================================
  // ACTUALIZAR ASISTENCIA
  // =====================================================

  private async updateBookingAttendance(
    bookingId: number,
    userId: number,
    status: BookingStatus,
  ) {
    this.validateId(bookingId);

    const booking = await this.bookingRepo.findOne({
      where: {
        id: bookingId,
      },
      relations: [
        'slot',
        'slot.teacher',
        'slot.teacher.user',
        'student',
        'student.user',
      ],
    });

    if (!booking) {
      throw new BadRequestException('Reserva no encontrada');
    }

    const teacher = booking.slot?.teacher;

    if (
      !teacher ||
      !teacher.active ||
      !teacher.user?.active ||
      teacher.user.id !== userId
    ) {
      throw new ForbiddenException('No tienes autorización sobre esta reserva');
    }

    if (!booking.student?.active || !booking.student.user?.active) {
      throw new BadRequestException('El alumno se encuentra inactivo');
    }

    if (booking.date !== getTodayChile()) {
      throw new BadRequestException(
        'Solo puedes registrar asistencias del día actual',
      );
    }

    if (status !== BookingStatus.ATTENDED && status !== BookingStatus.ABSENT) {
      throw new BadRequestException('Estado de asistencia inválido');
    }

    // Operación idempotente.

    if (booking.status === status) {
      return booking;
    }

    if (booking.status !== BookingStatus.BOOKED) {
      throw new BadRequestException(
        'La reserva ya tiene una asistencia registrada',
      );
    }

    const result = await this.bookingRepo.update(
      {
        id: bookingId,
        status: BookingStatus.BOOKED,
      },
      {
        status,
      },
    );

    if (result.affected !== 1) {
      throw new ConflictException('La asistencia ya fue procesada');
    }

    booking.status = status;

    return booking;
  }

  // =====================================================
  // PLANIFICAR SEMANA — PERSONALIZED
  // =====================================================

  async planWeekForStudent(userId: number, dto: PlanWeekDto) {
    if (!dto) {
      throw new BadRequestException('Datos de planificación inválidos');
    }

    validateDate(dto.weekStart);

    if (
      !Array.isArray(dto.days) ||
      dto.days.length === 0 ||
      dto.days.length > 6
    ) {
      throw new BadRequestException('Debes seleccionar entre 1 y 6 días');
    }

    const days = dto.days.map((day) => {
      if (typeof day !== 'string') {
        throw new BadRequestException('Día de entrenamiento inválido');
      }

      return day.toUpperCase();
    });

    if (new Set(days).size !== days.length) {
      throw new BadRequestException('No puedes seleccionar días duplicados');
    }

    const dayOffsets: Record<string, number> = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
      SATURDAY: 5,
    };

    const { from, to } = this.getWeekRange(dto.weekStart);

    return this.runTransaction(async (manager) => {
      const student = await this.lockStudentByUser(manager, userId);

      this.validateStudent(student, 'PERSONALIZED');

      if (!student.fixedHour) {
        throw new BadRequestException('Alumno sin horario fijo asignado');
      }

      const hour = this.normalizeHour(student.fixedHour);

      validateHour(hour);

      const requested: RequestedBooking[] = days.map((day) => {
        if (!Object.prototype.hasOwnProperty.call(dayOffsets, day)) {
          throw new BadRequestException(`Día no permitido: ${day}`);
        }

        return {
          date: addDays(from, dayOffsets[day]),
          hour,
        };
      });

      const result = await this.replaceWeekInternal(
        manager,
        student,
        from,
        to,
        requested,
      );

      return {
        ok: true,
        from,
        to,
        kept: result.kept,
        deleted: result.deleted,
        created: result.created,
        items: result.items,
      };
    });
  }

  // =====================================================
  // RESERVAR CLASE INDIVIDUAL — CLASS
  // =====================================================

  async createClassBooking(
    userId: number,
    body: {
      date: string;
      hour: string;
    },
  ) {
    if (!body) {
      throw new BadRequestException('Datos de reserva inválidos');
    }

    const { date } = body;

    validateDate(date);

    if (date < getTodayChile()) {
      throw new BadRequestException('No puedes reservar fechas pasadas');
    }

    const hour = this.normalizeHour(body.hour);

    validateHour(hour);

    return this.runTransaction(async (manager) => {
      const student = await this.lockStudentByUser(manager, userId);

      this.validateStudent(student, 'CLASS');

      this.validateClassHour(student, hour);

      const slot = await this.findActiveSlot(manager, student, hour);

      return this.insertSingleBooking(manager, student, slot, date);
    });
  }

  // =====================================================
  // REEMPLAZAR SEMANA — CLASS
  // =====================================================

  async replaceClassWeek(
    userId: number,
    body: {
      weekStart: string;
      days: {
        date: string;
        hour: string;
      }[];
    },
  ) {
    if (!body) {
      throw new BadRequestException('Datos de planificación inválidos');
    }

    validateDate(body.weekStart);

    if (!Array.isArray(body.days) || body.days.length > 6) {
      throw new BadRequestException(
        'La planificación debe contener hasta 6 días',
      );
    }

    const { from, to } = this.getWeekRange(body.weekStart);

    const requested: RequestedBooking[] = body.days.map((item) => {
      if (!item) {
        throw new BadRequestException('Clase inválida');
      }

      validateDate(item.date);

      const hour = this.normalizeHour(item.hour);

      validateHour(hour);

      if (item.date < from || item.date > to) {
        throw new BadRequestException(
          `La fecha ${item.date} no pertenece a la semana seleccionada`,
        );
      }

      return {
        date: item.date,
        hour,
      };
    });

    const uniqueDates = new Set(requested.map((item) => item.date));

    if (uniqueDates.size !== requested.length) {
      throw new BadRequestException(
        'No puedes reservar dos clases el mismo día',
      );
    }

    return this.runTransaction(async (manager) => {
      const student = await this.lockStudentByUser(manager, userId);

      this.validateStudent(student, 'CLASS');

      const result = await this.replaceWeekInternal(
        manager,
        student,
        from,
        to,
        requested,
      );

      return {
        ok: true,
        from,
        to,
        keptPast: result.keptPast,
        deleted: result.deleted,
        created: result.created,
        items: result.items,
      };
    });
  }

  // =====================================================
  // AGENDA DIARIA DEL PROFESOR
  // =====================================================

  async getTeacherDailySchedule(userId: number, date: string) {
    validateDate(date);

    const bookings = await this.bookingRepo.find({
      where: {
        date,
        slot: {
          teacher: {
            active: true,
            user: {
              id: userId,
              active: true,
            },
          },
        },
      },
      relations: ['student', 'student.user', 'slot', 'slot.teacher'],
      order: {
        slot: {
          hour: 'ASC',
        },
      },
    });

    const map = new Map<string, any>();

    for (const booking of bookings) {
      const hour = booking.slot.hour;
      const teacher = booking.slot.teacher;

      if (!map.has(hour)) {
        map.set(hour, {
          hour,
          teacher: teacher
            ? {
                id: teacher.id,
                firstName: teacher.firstName,
                lastName: teacher.lastName,
              }
            : null,
          students: [],
        });
      }

      map.get(hour).students.push({
        bookingId: booking.id,
        firstName: booking.student.firstName,
        lastName: booking.student.lastName,
        email: booking.student.user.email,
        status: booking.status,
      });
    }

    return Array.from(map.values());
  }

  // =====================================================
  // TRANSACCIÓN CENTRALIZADA
  // =====================================================

  private async runTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(operation);
    } catch (error) {
      const code = (error as any)?.driverError?.code ?? (error as any)?.code;

      if (code === '23505') {
        throw new ConflictException('Ya existe una reserva para ese horario');
      }

      if (code === '40001' || code === '40P01') {
        throw new ConflictException(
          'La agenda está siendo actualizada. Intenta nuevamente.',
        );
      }

      throw error;
    }
  }

  // =====================================================
  // BLOQUEAR ALUMNO DURANTE LA TRANSACCIÓN
  // =====================================================

  private async lockStudent(
    manager: EntityManager,
    studentId: number,
  ): Promise<Student> {
    const repository = manager.getRepository(Student);

    const locked = await repository
      .createQueryBuilder('student')
      .where('student.id = :studentId', {
        studentId,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!locked) {
      throw new BadRequestException('Alumno no encontrado');
    }

    const student = await repository.findOne({
      where: {
        id: studentId,
      },
      relations: ['user', 'plan', 'plan.schedules', 'teacher', 'teacher.user'],
    });

    if (!student) {
      throw new BadRequestException('Alumno no encontrado');
    }

    return student;
  }

  // =====================================================
  // IDENTIFICAR ALUMNO DESDE JWT
  // =====================================================

  private async lockStudentByUser(
    manager: EntityManager,
    userId: number,
  ): Promise<Student> {
    this.validateId(userId);

    const student = await manager.getRepository(Student).findOne({
      where: {
        user: {
          id: userId,
        },
      },
      loadEagerRelations: false,
    });

    if (!student) {
      throw new BadRequestException('Alumno no encontrado');
    }

    const locked = await this.lockStudent(manager, student.id);

    if (locked.user?.id !== userId) {
      throw new ForbiddenException('No tienes autorización sobre este alumno');
    }

    return locked;
  }

  // =====================================================
  // VALIDAR ALUMNO, PLAN Y PROFESOR
  // =====================================================

  private validateStudent(student: Student, expectedPlan?: string): void {
    if (!student.active || !student.user?.active) {
      throw new BadRequestException('El alumno se encuentra inactivo');
    }

    if (!student.plan) {
      throw new BadRequestException('Alumno sin plan asignado');
    }

    if (expectedPlan && student.plan.type !== expectedPlan) {
      throw new BadRequestException(
        `Esta operación requiere un plan ${expectedPlan}`,
      );
    }

    if (
      !Number.isInteger(student.plan.classesPerWeek) ||
      student.plan.classesPerWeek <= 0
    ) {
      throw new BadRequestException(
        'El plan no tiene clases semanales disponibles',
      );
    }

    if (
      !student.teacher ||
      !student.teacher.active ||
      !student.teacher.user?.active
    ) {
      throw new BadRequestException('Alumno sin profesor activo asignado');
    }
  }

  // =====================================================
  // VALIDAR HORARIO CLASS
  // =====================================================

  private validateClassHour(student: Student, hour: string): void {
    const allowedHours = [
      ...new Set(
        (student.plan.schedules || [])
          .map((schedule) => this.normalizeHour(schedule.hour))
          .filter(Boolean),
      ),
    ];

    if (allowedHours.length === 0) {
      throw new BadRequestException('El plan no tiene horarios configurados');
    }

    if (!allowedHours.includes(hour)) {
      throw new BadRequestException(
        `Horario no válido para este plan. Horarios permitidos: ${allowedHours.join(', ')}`,
      );
    }
  }

  // =====================================================
  // VALIDAR SLOT
  // =====================================================

  private validateSlot(student: Student, slot: ScheduleSlot): void {
    if (!slot.active || !slot.teacher?.active || !slot.teacher.user?.active) {
      throw new BadRequestException(
        'El horario o profesor se encuentra inactivo',
      );
    }

    if (slot.teacher.id !== student.teacher?.id) {
      throw new BadRequestException(
        'El horario no corresponde al profesor asignado',
      );
    }
  }

  // =====================================================
  // BUSCAR HORARIO ACTIVO
  // =====================================================

  private async findActiveSlot(
    manager: EntityManager,
    student: Student,
    hour: string,
  ): Promise<ScheduleSlot> {
    validateHour(hour);

    const slot = await manager.getRepository(ScheduleSlot).findOne({
      where: {
        teacher: {
          id: student.teacher!.id,
        },
        hour,
        active: true,
      },
      relations: ['teacher', 'teacher.user'],
    });

    if (!slot) {
      throw new BadRequestException(
        `No existe un horario disponible para las ${hour}`,
      );
    }

    this.validateSlot(student, slot);

    return slot;
  }

  // =====================================================
  // INSERTAR RESERVA INDIVIDUAL
  // =====================================================

  private async insertSingleBooking(
    manager: EntityManager,
    student: Student,
    slot: ScheduleSlot,
    date: string,
  ) {
    const repository = manager.getRepository(Booking);

    validateDate(date);

    if (date < getTodayChile()) {
      throw new BadRequestException('No puedes reservar fechas pasadas');
    }

    const { from, to } = this.getWeekRange(date);

    if (date < from || date > to) {
      throw new BadRequestException('No puedes reservar los domingos');
    }

    const existing = await repository.findOne({
      where: {
        student: {
          id: student.id,
        },
        date,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'El alumno ya tiene una clase agendada ese día',
      );
    }

    const weeklyCount = await repository.count({
      where: {
        student: {
          id: student.id,
        },
        date: Between(from, to),
      },
    });

    if (weeklyCount >= student.plan.classesPerWeek) {
      throw new BadRequestException('Límite semanal alcanzado');
    }

    const booking = repository.create({
      student,
      slot,
      date,
      status: BookingStatus.BOOKED,
    });

    return repository.save(booking);
  }

  // =====================================================
  // REEMPLAZAR PLANIFICACIÓN SEMANAL
  // PERSONALIZED / CLASS
  // =====================================================

  private async replaceWeekInternal(
    manager: EntityManager,
    student: Student,
    from: string,
    to: string,
    requested: RequestedBooking[],
  ) {
    const repository = manager.getRepository(Booking);

    const today = getTodayChile();

    // Bloquear las reservas existentes.
    // Evita modificaciones simultáneas mientras
    // se reemplaza la planificación.

    await repository
      .createQueryBuilder('booking')
      .innerJoin('booking.student', 'student')
      .where('student.id = :studentId', {
        studentId: student.id,
      })
      .andWhere('booking.date BETWEEN :from AND :to', {
        from,
        to,
      })
      .orderBy('booking.id', 'ASC')
      .setLock('pessimistic_write', undefined, ['booking'])
      .getMany();

    const existing = await repository.find({
      where: {
        student: {
          id: student.id,
        },
        date: Between(from, to),
      },
      relations: ['slot', 'slot.teacher'],
      order: {
        date: 'ASC',
      },
    });

    const requestedMap = new Map<string, string>();

    for (const item of requested) {
      validateDate(item.date);
      validateHour(item.hour);

      if (item.date < from || item.date > to) {
        throw new BadRequestException(`Fecha fuera de la semana: ${item.date}`);
      }

      if (requestedMap.has(item.date)) {
        throw new BadRequestException(
          'No puedes reservar dos clases el mismo día',
        );
      }

      requestedMap.set(item.date, item.hour);
    }

    // ===================================================
    // CONSERVAR RESERVAS PASADAS Y FINALIZADAS
    // ===================================================

    const protectedBookings = existing.filter(
      (booking) =>
        booking.date < today || booking.status !== BookingStatus.BOOKED,
    );

    const protectedDates = new Set(
      protectedBookings.map((booking) => booking.date),
    );

    for (const booking of protectedBookings) {
      const requestedHour = requestedMap.get(booking.date);

      const existingHour = this.normalizeHour(booking.slot.hour);

      if (requestedHour !== undefined && requestedHour !== existingHour) {
        throw new BadRequestException(
          `No puedes modificar la reserva protegida del ${booking.date}`,
        );
      }

      // Si Flutter envía una reserva histórica
      // sin modificaciones, se conserva.

      requestedMap.delete(booking.date);
    }

    // No permitir crear nuevas reservas pasadas.

    for (const date of requestedMap.keys()) {
      if (date < today) {
        throw new BadRequestException(
          `No puedes reservar fechas pasadas (${date})`,
        );
      }
    }

    // ===================================================
    // VALIDAR LÍMITE SEMANAL REAL
    // ===================================================

    const finalCount = protectedBookings.length + requestedMap.size;

    if (finalCount > student.plan.classesPerWeek) {
      throw new BadRequestException(
        `Límite semanal alcanzado. Tu plan permite ${student.plan.classesPerWeek} clases`,
      );
    }

    // ===================================================
    // IDENTIFICAR RESERVAS MODIFICABLES
    // ===================================================

    const mutableBookings = existing.filter(
      (booking) =>
        booking.date >= today && booking.status === BookingStatus.BOOKED,
    );

    const keptDates = new Set<string>();

    const toDelete: number[] = [];

    const toInsert: Array<{
      date: string;
      slot: ScheduleSlot;
    }> = [];

    for (const booking of mutableBookings) {
      const requestedHour = requestedMap.get(booking.date);

      const existingHour = this.normalizeHour(booking.slot.hour);

      const sameTeacher = booking.slot.teacher?.id === student.teacher?.id;

      if (
        !protectedDates.has(booking.date) &&
        requestedHour !== undefined &&
        requestedHour === existingHour &&
        sameTeacher &&
        !keptDates.has(booking.date)
      ) {
        keptDates.add(booking.date);
      } else {
        toDelete.push(booking.id);
      }
    }

    // ===================================================
    // VALIDAR TODOS LOS HORARIOS ANTES DE ELIMINAR
    // ===================================================

    const slotCache = new Map<string, ScheduleSlot>();

    for (const [date, hour] of requestedMap) {
      if (student.plan.type === 'CLASS') {
        this.validateClassHour(student, hour);
      }

      if (
        student.plan.type === 'PERSONALIZED' &&
        hour !== this.normalizeHour(student.fixedHour || '')
      ) {
        throw new BadRequestException('El horario no corresponde al alumno');
      }

      let slot = slotCache.get(hour);

      if (!slot) {
        slot = await this.findActiveSlot(manager, student, hour);

        slotCache.set(hour, slot);
      }

      if (keptDates.has(date)) {
        continue;
      }

      toInsert.push({
        date,
        slot,
      });
    }

    // ===================================================
    // ELIMINAR RESERVAS MODIFICABLES
    // ===================================================

    let deleted = 0;

    if (toDelete.length > 0) {
      const result = await repository
        .createQueryBuilder()
        .delete()
        .from(Booking)
        .whereInIds(toDelete)
        .andWhere('status = :status', {
          status: BookingStatus.BOOKED,
        })
        .execute();

      deleted = result.affected ?? 0;

      if (deleted !== toDelete.length) {
        throw new ConflictException(
          'La agenda fue modificada durante la operación',
        );
      }
    }

    // ===================================================
    // INSERTAR NUEVAS RESERVAS
    // ===================================================

    if (toInsert.length > 0) {
      const bookings = toInsert.map((item) =>
        repository.create({
          student,
          slot: item.slot,
          date: item.date,
          status: BookingStatus.BOOKED,
        }),
      );

      await repository.save(bookings);
    }

    // ===================================================
    // RECUPERAR PLANIFICACIÓN DEFINITIVA
    // ===================================================

    const items = await repository.find({
      where: {
        student: {
          id: student.id,
        },
        date: Between(from, to),
      },
      relations: [
        'student',
        'student.user',
        'slot',
        'slot.teacher',
        'slot.teacher.user',
      ],
      order: {
        date: 'ASC',
      },
    });

    return {
      kept: protectedBookings.length + keptDates.size,

      keptPast: protectedBookings.filter((booking) => booking.date < today)
        .length,

      deleted,

      created: toInsert.length,

      items,
    };
  }

  // =====================================================
  // OBTENER SEMANA LUNES — SÁBADO
  // =====================================================

  private getWeekRange(date: string): {
    from: string;
    to: string;
  } {
    validateDate(date);

    const parsed = new Date(`${date}T00:00:00Z`);

    const day = parsed.getUTCDay();

    const offset = (day + 6) % 7;

    const from = addDays(date, -offset);

    const to = addDays(from, 5);

    return {
      from,
      to,
    };
  }

  // =====================================================
  // NORMALIZAR HORA
  // =====================================================

  private normalizeHour(hour: string): string {
    if (typeof hour !== 'string') {
      return '';
    }

    const value = hour.trim();

    if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
      return value.slice(0, 5);
    }

    if (/^\d{1,2}:\d{2}$/.test(value)) {
      const [hh, mm] = value.split(':');

      return `${hh.padStart(2, '0')}:${mm}`;
    }

    return value;
  }

  // =====================================================
  // VALIDAR IDENTIFICADORES
  // =====================================================

  private validateId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Identificador inválido');
    }
  }
}
