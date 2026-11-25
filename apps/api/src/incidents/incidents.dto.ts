import {
  IsIn,
  IsNotEmpty,
  ValidateIf,
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
  @MaxLength(255)
  owner!: string;
}

export class UpdateIncidentDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(statuses)
  status?: IncidentStatus;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(severities)
  severity?: Severity;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  owner?: string;
}

export class AddTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message!: string;
}
