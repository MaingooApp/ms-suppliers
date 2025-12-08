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
  listSuppliers(@Payload() payload?: { enterpriseId?: string }) {
    return this.suppliersService.listSuppliers(payload?.enterpriseId);
  }

  @MessagePattern(SuppliersSubjects.deleteSupplier)
  deleteSupplier(@Payload() payload: { id: string }) {
    return this.suppliersService.deleteSupplier(payload.id);
  }

  @MessagePattern(SuppliersSubjects.healthCheck)
  health() {
    return this.suppliersService.health();
  }
}
