import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { IncidentStatus, Severity, severities, statuses } from './incident.types';

export class CreateIncidentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string;

  @IsIn(severities)
  severity!: Severity;

  @IsString()
  @IsNotEmpty()
  owner!: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsIn(statuses)
  status?: IncidentStatus;

  @IsOptional()
  @IsIn(severities)
  severity?: Severity;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  owner?: string;
}

export class AddTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}
