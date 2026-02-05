import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {}

  create(data: {
    name: string;
    classesPerWeek: number;
    requiresTeacher: boolean;
    weekdayStartHour?: string;
    weekdayEndHour?: string;
    saturdayStartHour?: string;
    saturdayEndHour?: string;
  }) {
    const plan = this.planRepository.create(data);
    return this.planRepository.save(plan);
  }

  findAll() {
    return this.planRepository.find();
  }

  findOne(id: number) {
    return this.planRepository.findOneBy({ id });
  }

  remove(id: number) {
    return this.planRepository.delete(id);
  }
}
