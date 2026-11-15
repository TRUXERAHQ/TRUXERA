export const driverStatuses = [
  "AVAILABLE",
  "ON_DUTY",
  "OFF_DUTY",
  "ON_LEAVE",
  "INACTIVE",
] as const;

export type DriverStatus = (typeof driverStatuses)[number];

export type DriverInput = {
  name: string;
  phone: string | null;
  licenseNumber: string | null;
  status: DriverStatus;
};

export type DeliveryStopInput = {
  reference: string | null;
  recipientName: string | null;
  destinationAddress: string;
};

export type LoadInput = {
  reference: string;
  customerName: string;
  pickupAddress: string;
  cargoDescription: string | null;
  weightKg: string | null;
  deliveries: DeliveryStopInput[];
};

export type LoadUpdateInput = {
  customerName: string;
  cargoDescription: string | null;
};

export type InputResult<T> =
  | { input: T }
  | { error: string };

function optionalText(
  formData: FormData,
  name: string,
  label: string,
  maxLength: number,
): InputResult<string | null> {
  const value = formData.get(name);
  if (value === null) return { input: null };
  if (typeof value !== "string") return { error: `Enter a valid ${label}.` };

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { error: `${label} must be ${maxLength} characters or fewer.` };
  }

  return { input: trimmed || null };
}

function requiredText(
  formData: FormData,
  name: string,
  label: string,
  maxLength: number,
): InputResult<string> {
  const value = formData.get(name);
  if (typeof value !== "string") return { error: `Enter ${label}.` };

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return { error: `Enter ${label} using no more than ${maxLength} characters.` };
  }

  return { input: trimmed };
}

function isDriverStatus(value: string): value is DriverStatus {
  return driverStatuses.some((status) => status === value);
}

export function parseDriverInput(formData: FormData): InputResult<DriverInput> {
  const name = requiredText(formData, "name", "a driver name", 120);
  if ("error" in name) return { error: name.error };

  const phone = optionalText(formData, "phone", "phone number", 40);
  if ("error" in phone) return { error: phone.error };

  const license = optionalText(
    formData,
    "licenseNumber",
    "license number",
    64,
  );
  if ("error" in license) return { error: license.error };
  const licenseNumber = license.input?.toLocaleUpperCase() ?? null;
  if (
    licenseNumber &&
    !/^[\p{L}\p{N} ._/-]{1,64}$/u.test(licenseNumber)
  ) {
    return { error: "Use letters, numbers, spaces, periods, underscores, slashes, or hyphens for the license number." };
  }

  const statusValue = formData.get("status");
  if (typeof statusValue !== "string" || !isDriverStatus(statusValue)) {
    return { error: "Select a valid driver status." };
  }

  return {
    input: {
      name: name.input,
      phone: phone.input,
      licenseNumber,
      status: statusValue,
    },
  };
}

function repeatedText(
  formData: FormData,
  name: string,
  count: number,
  label: string,
  maxLength: number,
): InputResult<Array<string | null>> {
  const values = formData.getAll(name);
  if (values.length !== count) {
    return { error: `Enter a valid ${label} for each delivery stop.` };
  }

  const result: Array<string | null> = [];
  for (const value of values) {
    if (typeof value !== "string") {
      return { error: `Enter a valid ${label} for each delivery stop.` };
    }

    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      return { error: `${label} must be ${maxLength} characters or fewer.` };
    }
    result.push(trimmed || null);
  }

  return { input: result };
}

export function parseLoadInput(formData: FormData): InputResult<LoadInput> {
  const reference = requiredText(formData, "reference", "a load reference", 64);
  if ("error" in reference) return { error: reference.error };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,63}$/u.test(reference.input)) {
    return { error: "Use letters, numbers, spaces, periods, underscores, slashes, or hyphens for the load reference." };
  }

  const customerName = requiredText(
    formData,
    "customerName",
    "a customer name",
    120,
  );
  if ("error" in customerName) return { error: customerName.error };

  const pickupAddress = requiredText(
    formData,
    "pickupAddress",
    "a pickup address",
    500,
  );
  if ("error" in pickupAddress) return { error: pickupAddress.error };

  const cargoDescription = optionalText(
    formData,
    "cargoDescription",
    "cargo description",
    500,
  );
  if ("error" in cargoDescription) return { error: cargoDescription.error };

  const weight = optionalText(formData, "weightKg", "load weight", 16);
  if ("error" in weight) return { error: weight.error };
  if (
    weight.input &&
    (!/^(?:\d{1,9}|1000000000)(?:\.\d{1,3})?$/.test(weight.input) ||
      Number(weight.input) <= 0 ||
      Number(weight.input) > 1_000_000_000)
  ) {
    return {
      error: "Load weight must be greater than zero and no more than 1 billion kg.",
    };
  }

  const destinations = formData.getAll("stopDestinationAddress");
  if (destinations.length < 1 || destinations.length > 20) {
    return { error: "Add between 1 and 20 delivery stops." };
  }

  const recipients = repeatedText(
    formData,
    "stopRecipientName",
    destinations.length,
    "recipient name",
    120,
  );
  if ("error" in recipients) return { error: recipients.error };

  const deliveryReferences = repeatedText(
    formData,
    "stopReference",
    destinations.length,
    "delivery reference",
    64,
  );
  if ("error" in deliveryReferences) {
    return { error: deliveryReferences.error };
  }

  const deliveries: DeliveryStopInput[] = [];
  for (let index = 0; index < destinations.length; index += 1) {
    const destination = destinations[index];
    if (typeof destination !== "string" || !destination.trim()) {
      return { error: `Enter a destination address for stop ${index + 1}.` };
    }
    if (destination.trim().length > 500) {
      return { error: "Destination addresses must be 500 characters or fewer." };
    }

    deliveries.push({
      reference: deliveryReferences.input[index],
      recipientName: recipients.input[index],
      destinationAddress: destination.trim(),
    });
  }

  return {
    input: {
      reference: reference.input.toLocaleUpperCase(),
      customerName: customerName.input,
      pickupAddress: pickupAddress.input,
      cargoDescription: cargoDescription.input,
      weightKg: weight.input,
      deliveries,
    },
  };
}

export function parseLoadUpdateInput(
  formData: FormData,
): InputResult<LoadUpdateInput> {
  const customerName = requiredText(
    formData,
    "customerName",
    "a customer name",
    120,
  );
  if ("error" in customerName) return { error: customerName.error };

  const cargoDescription = optionalText(
    formData,
    "cargoDescription",
    "cargo description",
    500,
  );
  if ("error" in cargoDescription) return { error: cargoDescription.error };

  return {
    input: {
      customerName: customerName.input,
      cargoDescription: cargoDescription.input,
    },
  };
}
