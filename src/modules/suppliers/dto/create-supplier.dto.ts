import { IsString, IsOptional, IsDecimal } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  enterpriseId!: string;

  @IsString()
  name!: string;

  @IsString()
  cifNif!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  commercialName?: string;

  @IsOptional()
  @IsString()
  commercialPhoneNumber?: string;

  @IsOptional()
  @IsString()
  deliveryDays?: string;

  @IsOptional()
  @IsDecimal()
  minPriceDelivery?: number;

  @IsOptional()
  @IsString()
  sanitaryRegistrationNumber?: string;
}
