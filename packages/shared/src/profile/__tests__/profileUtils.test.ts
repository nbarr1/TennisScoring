import {
  addAvailabilitySlot,
  buildUserProfileUpdates,
  cycleAvailabilitySlotDay,
  removeAvailabilitySlot,
  updateAvailabilitySlot,
  validateAvailabilitySlots,
} from "../profileUtils";

describe("profileUtils", () => {
  it("adds, updates, cycles, and removes availability slots immutably", () => {
    const added = addAvailabilitySlot([]);
    expect(added).toEqual([{ day: "mon", from: "18:00", to: "21:00" }]);

    const updated = updateAvailabilitySlot(added, 0, {
      day: "fri",
      from: "09:00",
    });
    expect(updated).toEqual([{ day: "fri", from: "09:00", to: "21:00" }]);
    expect(added[0]).toEqual({ day: "mon", from: "18:00", to: "21:00" });

    const cycled = cycleAvailabilitySlotDay(updated, 0);
    expect(cycled[0]?.day).toBe("sat");

    expect(removeAvailabilitySlot(cycled, 0)).toEqual([]);
  });

  it("validates HH:MM slots and ordered ranges", () => {
    expect(
      validateAvailabilitySlots([{ day: "mon", from: "18:00", to: "21:00" }]),
    ).toEqual({ valid: true });
    expect(
      validateAvailabilitySlots([{ day: "mon", from: "8:00", to: "21:00" }]),
    ).toMatchObject({ valid: false, reason: "invalid_time" });
    expect(
      validateAvailabilitySlots([{ day: "mon", from: "21:00", to: "18:00" }]),
    ).toMatchObject({ valid: false, reason: "invalid_range" });
  });

  it("normalizes profile update payloads", () => {
    expect(
      buildUserProfileUpdates({
        displayName: "  Serena  ",
        email: " SERENA@EXAMPLE.COM ",
        phone: "  ",
        allowEmail: true,
        allowSMS: false,
        allowInApp: true,
        tipsEnabled: false,
        availabilitySlots: [{ day: "sun", from: "10:00", to: "11:00" }],
        availabilityNote: "  Clay preferred  ",
        selectedDivisionId: "",
      }),
    ).toEqual({
      displayName: "Serena",
      email: "serena@example.com",
      phone: undefined,
      contactPreferences: {
        allowEmail: true,
        allowSMS: false,
        allowInApp: true,
      },
      tipsEnabled: false,
      availability: {
        slots: [{ day: "sun", from: "10:00", to: "11:00" }],
        note: "Clay preferred",
      },
      divisionId: undefined,
    });
  });
});
