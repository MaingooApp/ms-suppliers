import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { SuppliersService } from './suppliers.service';
import { SuppliersSubjects } from 'src/config';
import type { CreateSupplierDto } from './dto';

@Controller()
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @MessagePattern(SuppliersSubjects.createSupplier)
  createSupplier(@Payload() payload: CreateSupplierDto) {
    return this.suppliersService.createSupplier(payload);
  }

  @MessagePattern(SuppliersSubjects.getSupplier)
  getSupplier(@Payload() payload: { id: string }) {
    return this.suppliersService.getSupplierById(payload.id);
  }

  @MessagePattern(SuppliersSubjects.listSuppliers)
  listSuppliers() {
    return this.suppliersService.listSuppliers();
  }

  @MessagePattern(SuppliersSubjects.healthCheck)
  health() {
    return this.suppliersService.health();
  }
}
