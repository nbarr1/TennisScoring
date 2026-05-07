import type {
  Availability,
  AvailabilitySlot,
  DayOfWeek,
  User,
} from "../types/user";
import { DAYS_OF_WEEK } from "../types/user";

export const DEFAULT_AVAILABILITY_SLOT: AvailabilitySlot = {
  day: "mon",
  from: "18:00",
  to: "21:00",
};

export const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type AvailabilityValidationResult =
  | { valid: true }
  | { valid: false; reason: "invalid_time" | "invalid_range"; message: string };

export function createDefaultAvailabilitySlot(): AvailabilitySlot {
  return { ...DEFAULT_AVAILABILITY_SLOT };
}

export function addAvailabilitySlot(
  slots: AvailabilitySlot[],
): AvailabilitySlot[] {
  return [...slots, createDefaultAvailabilitySlot()];
}

export function updateAvailabilitySlot(
  slots: AvailabilitySlot[],
  index: number,
  patch: Partial<AvailabilitySlot>,
): AvailabilitySlot[] {
  return slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot));
}

export function removeAvailabilitySlot(
  slots: AvailabilitySlot[],
  index: number,
): AvailabilitySlot[] {
  return slots.filter((_, i) => i !== index);
}

export function nextDayOfWeek(day: DayOfWeek): DayOfWeek {
  return DAYS_OF_WEEK[(DAYS_OF_WEEK.indexOf(day) + 1) % DAYS_OF_WEEK.length];
}

export function cycleAvailabilitySlotDay(
  slots: AvailabilitySlot[],
  index: number,
): AvailabilitySlot[] {
  return slots.map((slot, i) =>
    i === index ? { ...slot, day: nextDayOfWeek(slot.day) } : slot,
  );
}

export function validateAvailabilitySlots(
  slots: AvailabilitySlot[],
): AvailabilityValidationResult {
  for (const slot of slots) {
    if (!TIME_24H_PATTERN.test(slot.from) || !TIME_24H_PATTERN.test(slot.to)) {
      return {
        valid: false,
        reason: "invalid_time",
        message: "Times must be in HH:MM 24-hour format.",
      };
    }
    if (slot.from >= slot.to) {
      return {
        valid: false,
        reason: "invalid_range",
        message: "Each slot must end after it starts.",
      };
    }
  }

  return { valid: true };
}

export function buildAvailability(
  slots: AvailabilitySlot[],
  note: string,
): Availability {
  const trimmedNote = note.trim();
  return {
    slots,
    ...(trimmedNote && { note: trimmedNote }),
  };
}

export interface ProfileFormValues {
  displayName: string;
  email: string;
  phone: string;
  allowEmail: boolean;
  allowSMS: boolean;
  allowInApp: boolean;
  tipsEnabled: boolean;
  availabilitySlots: AvailabilitySlot[];
  availabilityNote: string;
  selectedDivisionId: string;
}

export function buildUserProfileUpdates(
  values: ProfileFormValues,
): Partial<User> {
  return {
    displayName: values.displayName.trim(),
    email: values.email.trim().toLowerCase() || undefined,
    phone: values.phone.trim() || undefined,
    contactPreferences: {
      allowEmail: values.allowEmail,
      allowSMS: values.allowSMS,
      allowInApp: values.allowInApp,
    },
    tipsEnabled: values.tipsEnabled,
    availability: buildAvailability(
      values.availabilitySlots,
      values.availabilityNote,
    ),
    divisionId: values.selectedDivisionId || undefined,
  };
}
