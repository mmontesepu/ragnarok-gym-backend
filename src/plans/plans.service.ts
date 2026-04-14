import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan, PlanType } from './plan.entity';
import { PlanSchedule } from './plan-schedule.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  async create(data: {
    name: string;
    classesPerWeek: number;
    type: PlanType;
    weekdayStartHour?: string;
    weekdayEndHour?: string;
    saturdayStartHour?: string;
    saturdayEndHour?: string;
    schedules?: { dayOfWeek: string; hour: string }[];
  }) {
    let requiresTeacher = false;

    // ===============================
    // 🔥 DEFINICIÓN POR TIPO
    // ===============================
    if (data.type === PlanType.PERSONALIZED) {
      requiresTeacher = true;
    }

    if (data.type === PlanType.CLASS) {
      requiresTeacher = true;
    }

    if (data.type === PlanType.FREE) {
      requiresTeacher = false;
    }

    // ===============================
    // 🔥 VALIDACIONES
    // ===============================
    if (data.type === PlanType.FREE) {
      if (!data.weekdayStartHour || !data.weekdayEndHour) {
        throw new BadRequestException('FREE debe tener rango horario semana');
      }
    }

    if (data.type === PlanType.CLASS) {
      if (!data.schedules || data.schedules.length === 0) {
        throw new BadRequestException('CLASS debe tener horarios definidos');
      }
    }

    // ===============================
    // 🔥 CREAR PLAN BASE
    // ===============================
    const plan = this.planRepository.create({
      name: data.name,
      classesPerWeek: data.classesPerWeek,
      requiresTeacher: requiresTeacher,
      type: data.type,
      weekdayStartHour: data.weekdayStartHour,
      weekdayEndHour: data.weekdayEndHour,
      saturdayStartHour: data.saturdayStartHour,
      saturdayEndHour: data.saturdayEndHour,
    });

    const savedPlan = await this.planRepository.save(plan);

    // ===============================
    // 🔥 CREAR SCHEDULES
    // ===============================
    let scheduleEntities: PlanSchedule[] = [];

    if (data.type === PlanType.CLASS && data.schedules) {
      scheduleEntities = data.schedules.map((s) => {
        const schedule = new PlanSchedule();

        schedule.dayOfWeek = s.dayOfWeek.toUpperCase();
        schedule.hour = s.hour;
        schedule.plan = savedPlan;

        return schedule;
      });

      savedPlan.schedules = scheduleEntities;
      await this.planRepository.save(savedPlan);
    }

    // ===============================
    // 🔥 RESPONSE LIMPIO (FIX CIRCULAR)
    // ===============================
    return {
      id: savedPlan.id,
      name: savedPlan.name,
      classesPerWeek: savedPlan.classesPerWeek,
      type: savedPlan.type,
      requiresTeacher: savedPlan.requiresTeacher,
      weekdayStartHour: savedPlan.weekdayStartHour,
      weekdayEndHour: savedPlan.weekdayEndHour,
      saturdayStartHour: savedPlan.saturdayStartHour,
      saturdayEndHour: savedPlan.saturdayEndHour,
      schedules: scheduleEntities.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        hour: s.hour,
      })),
    };
  }

  findAll() {
    return this.planRepository.find({
      relations: ['schedules'],
    });
  }

  findOne(id: number) {
    return this.planRepository.findOne({
      where: { id },
      relations: ['schedules'],
    });
  }

  remove(id: number) {
    return this.planRepository.delete(id);
  }
}
