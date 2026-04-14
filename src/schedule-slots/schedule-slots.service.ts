import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleSlot } from './schedule-slot.entity';
import { Teacher, TeacherTurn } from '../teachers/teacher.entity';
import { Plan } from '../plans/plan.entity';

@Injectable()
export class ScheduleSlotsService {
  constructor(
    @InjectRepository(ScheduleSlot)
    private readonly slotRepo: Repository<ScheduleSlot>,
  ) {}

  // 🔹 LISTAR TODOS LOS HORARIOS
  async findAll() {
    const slots = await this.slotRepo.find({
      relations: ['teacher', 'teacher.user'],
      order: { hour: 'ASC' },
    });

    const slotsWithCapacity = await Promise.all(
      slots.map(async (slot) => {
        const count = await this.slotRepo.manager.count('students', {
          where: {
            teacher: { id: slot.teacher.id },
            fixedHour: slot.hour,
            active: true,
          },
        });

        return {
          ...slot,
          currentCapacity: count,
        };
      }),
    );

    return slotsWithCapacity;
  }

  // 🔹 BUSCAR SLOT POR ID
  async findOne(id: number) {
    return this.slotRepo.findOne({
      where: { id },
      relations: ['teacher'],
    });
  }

  // 🔹 BUSCAR SLOT POR PROFESOR + HORA
  async findByTeacherAndHour(teacherId: number, hour: string) {
    return this.slotRepo.findOne({
      where: {
        teacher: { id: teacherId },
        hour,
        active: true,
      },
      relations: ['teacher'],
    });
  }

  // 🔹 INCREMENTAR CUPO DE FORMA SEGURA
  async incrementCapacity(slotId: number) {
    const result = await this.slotRepo
      .createQueryBuilder()
      .update(ScheduleSlot)
      .set({
        currentCapacity: () => '"currentCapacity" + 1',
      })
      .where('id = :id', { id: slotId })
      .andWhere('active = true')
      .andWhere('"currentCapacity" < "maxCapacity"')
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException('Slot is full or not available');
    }
  }

  // 🔹 GENERAR HORARIOS AUTOMÁTICOS AL CREAR PROFESOR PERSONALIZED
  async createSlotsForTeacher(teacher: Teacher) {
    const ranges =
      teacher.turn === TeacherTurn.MORNING
        ? { start: 6, end: 14 } // 06:00 a 13:00
        : { start: 15, end: 22 }; // 15:00 a 21:00

    const slots: ScheduleSlot[] = [];

    for (let hour = ranges.start; hour < ranges.end; hour++) {
      const hourLabel = `${hour.toString().padStart(2, '0')}:00`;

      slots.push(
        this.slotRepo.create({
          teacher,
          turn: teacher.turn,
          hour: hourLabel,
          maxCapacity: 5,
          currentCapacity: 0,
          active: true,
        }),
      );
    }

    return this.slotRepo.save(slots);
  }

  // 🔹 GENERAR SLOTS PARA PROFESOR CLASS DESDE LOS HORARIOS DE SUS PLANES
  async createSlotsForClassTeacher(teacher: Teacher, plans: Plan[]) {
    const hoursSet = new Set<string>();

    for (const plan of plans) {
      for (const schedule of plan.schedules || []) {
        hoursSet.add(schedule.hour);
      }
    }

    const hours = Array.from(hoursSet);

    if (hours.length === 0) {
      console.log('⚠️ No se encontraron horas para crear slots CLASS', {
        teacherId: teacher.id,
        plans,
      });
      return;
    }

    const slots: ScheduleSlot[] = [];

    for (const hour of hours) {
      slots.push(
        this.slotRepo.create({
          teacher,
          turn: TeacherTurn.EVENING, // 🔥 IMPORTANTE
          hour,
          maxCapacity: 20,
          currentCapacity: 0,
          active: true,
        }),
      );
    }

    console.log('🔥 Slots CLASS creados:', hours);

    return this.slotRepo.save(slots);
  }
}
