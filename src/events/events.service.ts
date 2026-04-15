import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { EventRegistration } from './event-registration.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { StudentsService } from '../students/students.service';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,

    @InjectRepository(EventRegistration)
    private readonly registrationRepo: Repository<EventRegistration>,

    private readonly studentsService: StudentsService,
  ) {}

  async create(dto: CreateEventDto) {
    if (!dto.title?.trim()) {
      throw new BadRequestException('El título es obligatorio');
    }

    if (!dto.description?.trim()) {
      throw new BadRequestException('La descripción es obligatoria');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    if (!/^\d{2}:\d{2}$/.test(dto.hour)) {
      throw new BadRequestException('hour must be HH:mm');
    }

    if (
      dto.maxParticipants !== undefined &&
      dto.maxParticipants !== null &&
      dto.maxParticipants < 1
    ) {
      throw new BadRequestException('maxParticipants debe ser mayor a 0');
    }

    const event = this.eventRepo.create({
      title: dto.title.trim(),
      description: dto.description.trim(),
      date: dto.date,
      hour: dto.hour,
      location: dto.location?.trim() || null,
      maxParticipants: dto.maxParticipants ?? null,
      active: dto.active ?? true,
    });

    return this.eventRepo.save(event);
  }

  async findAllActive(userId?: number) {
    const events = await this.eventRepo.find({
      where: { active: true },
      relations: ['registrations', 'registrations.student'],
      order: {
        date: 'ASC',
        hour: 'ASC',
      },
    });

    let studentId: number | null = null;

    if (userId) {
      const student = await this.studentsService.findByUserId(userId);
      studentId = student?.id ?? null;
    }

    return events.map((event) => {
      const participantCount = event.registrations?.length ?? 0;

      const isRegistered = studentId
        ? (event.registrations ?? []).some((r) => r.student?.id === studentId)
        : false;

      return {
        id: event.id,
        title: event.title,
        description: event.description,
        date: event.date,
        hour: event.hour,
        location: event.location,
        maxParticipants: event.maxParticipants,
        active: event.active,
        participantCount,
        isRegistered,
      };
    });
  }

  async findAllForAdmin() {
    const events = await this.eventRepo.find({
      relations: ['registrations', 'registrations.student'],
      order: {
        date: 'ASC',
        hour: 'ASC',
      },
    });

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      hour: event.hour,
      location: event.location,
      maxParticipants: event.maxParticipants,
      active: event.active,
      participantCount: event.registrations?.length ?? 0,
      createdAt: event.createdAt,
    }));
  }

  async register(eventId: number, userId: number) {
    const student = await this.studentsService.findByUserId(userId);

    if (!student || !student.active) {
      throw new BadRequestException('Alumno no encontrado o inactivo');
    }

    const event = await this.eventRepo.findOne({
      where: { id: eventId },
      relations: ['registrations', 'registrations.student'],
    });

    if (!event || !event.active) {
      throw new NotFoundException('Evento no encontrado o inactivo');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventDate = new Date(`${event.date}T00:00:00`);
    if (eventDate < today) {
      throw new BadRequestException('No puedes inscribirte en eventos pasados');
    }

    const existing = await this.registrationRepo.findOne({
      where: {
        event: { id: event.id },
        student: { id: student.id },
      },
      relations: ['event', 'student'],
    });

    if (existing) {
      throw new BadRequestException('Ya estás inscrito en este evento');
    }

    const participantCount = event.registrations?.length ?? 0;
    if (
      event.maxParticipants !== null &&
      event.maxParticipants !== undefined &&
      participantCount >= event.maxParticipants
    ) {
      throw new BadRequestException('El evento ya no tiene cupos disponibles');
    }

    const registration = this.registrationRepo.create({
      event,
      student,
      confirmed: true,
    });

    await this.registrationRepo.save(registration);

    return {
      ok: true,
      message: 'Inscripción realizada correctamente',
    };
  }

  async unregister(eventId: number, userId: number) {
    const student = await this.studentsService.findByUserId(userId);

    if (!student) {
      throw new BadRequestException('Alumno no encontrado');
    }

    const registration = await this.registrationRepo.findOne({
      where: {
        event: { id: eventId },
        student: { id: student.id },
      },
      relations: ['event', 'student'],
    });

    if (!registration) {
      throw new NotFoundException('No estabas inscrito en este evento');
    }

    const eventDate = new Date(`${registration.event.date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      throw new BadRequestException(
        'No puedes cancelar eventos que ya ocurrieron',
      );
    }

    await this.registrationRepo.delete(registration.id);

    return {
      ok: true,
      message: 'Inscripción cancelada correctamente',
    };
  }

  async getParticipants(eventId: number) {
    const event = await this.eventRepo.findOne({
      where: { id: eventId },
      relations: [
        'registrations',
        'registrations.student',
        'registrations.student.user',
      ],
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    return {
      event: {
        id: event.id,
        title: event.title,
        date: event.date,
        hour: event.hour,
        location: event.location,
      },
      participants: (event.registrations ?? []).map((r) => ({
        registrationId: r.id,
        studentId: r.student?.id,
        firstName: r.student?.firstName,
        lastName: r.student?.lastName,
        email: r.student?.user?.email,
        confirmed: r.confirmed,
      })),
    };
  }

  async toggleEvent(eventId: number) {
    const event = await this.eventRepo.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    event.active = !event.active;

    await this.eventRepo.save(event);

    return {
      ok: true,
      active: event.active,
    };
  }

  async deleteEvent(eventId: number) {
    const event = await this.eventRepo.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    await this.eventRepo.delete(eventId);

    return { ok: true };
  }
}
