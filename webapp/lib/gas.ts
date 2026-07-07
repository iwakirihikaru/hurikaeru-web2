type GasEnvelope<T> = {
  ok: boolean;
  data: T | null;
  error: {
    message?: string;
  } | null;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(name + " is not configured.");
  }
  return value;
}

export function getGasApiUrl() {
  return getRequiredEnv("NEXT_PUBLIC_GAS_API_URL");
}

export function getGasConfigKey() {
  return process.env.NEXT_PUBLIC_GAS_CONFIG_KEY ?? "furikaeri_webapp_state";
}

export async function callGasApi<T>(payload: Record<string, unknown>) {
  const response = await fetch(getGasApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("GAS request failed with status " + response.status + ".");
  }

  const result = (await response.json()) as GasEnvelope<T>;
  if (!result.ok) {
    throw new Error(result.error?.message || "Unknown GAS error.");
  }

  return result.data;
}
