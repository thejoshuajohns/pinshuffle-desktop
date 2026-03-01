import { createHash } from "node:crypto";
import { AppConfig, PATHS, readJson, writeJson } from "./config";
import { PinsFile } from "./scrape";
import { createRuntimeSeed, createSeededRandom, fisherYatesShuffle } from "./shuffle";

export interface PlannedPin {
  id: string;
  url: string;
}

export interface PlanFile {
  destinationBoardName: string;
  seedUsed: string;
  planHash: string;
  selectedPins: PlannedPin[];
  totalAvailable: number;
  createdAt: string;
}

export function loadPlan(filePath = PATHS.plan): PlanFile {
  const plan = readJson<Omit<PlanFile, "planHash"> & Partial<Pick<PlanFile, "planHash">>>(filePath);

  if (plan.planHash) {
    return plan as PlanFile;
  }

  return {
    ...plan,
    planHash: computePlanHash({
      destinationBoardName: plan.destinationBoardName,
      seedUsed: plan.seedUsed,
      selectedPins: plan.selectedPins
    })
  };
}

export function runPlan(config: AppConfig): PlanFile {
  const pinsFile = readJson<PinsFile>(PATHS.pins);

  const uniquePins = dedupePins(
    pinsFile.pins.map((pin) => ({
      id: pin.id,
      url: pin.url
    }))
  );

  if (uniquePins.length === 0) {
    throw new Error(`No pins available in ${PATHS.pins}. Run scrape first.`);
  }

  const seedUsed = config.seed ?? createRuntimeSeed();
  const random = createSeededRandom(seedUsed);
  const shuffled = fisherYatesShuffle(uniquePins, random);
  const limit = config.pinsToCopy === "all" ? shuffled.length : Math.min(config.pinsToCopy, shuffled.length);
  const selectedPins = shuffled.slice(0, limit);

  const plan: PlanFile = {
    destinationBoardName: config.destinationBoardName,
    seedUsed,
    planHash: computePlanHash({
      destinationBoardName: config.destinationBoardName,
      seedUsed,
      selectedPins
    }),
    selectedPins,
    totalAvailable: uniquePins.length,
    createdAt: new Date().toISOString()
  };

  writeJson(PATHS.plan, plan);

  console.log(`Plan written to ${PATHS.plan}`);
  console.log(`Total available: ${plan.totalAvailable}`);
  console.log(`Selected: ${plan.selectedPins.length}`);
  if (config.pinsToCopy === "all") {
    console.log("Selection mode: all available pins");
  }
  console.log(`Plan hash: ${plan.planHash}`);
  console.log(`Seed: ${plan.seedUsed}`);
  console.log("First 10 selected pin URLs:");
  plan.selectedPins.slice(0, 10).forEach((pin, index) => {
    console.log(`${index + 1}. ${pin.url}`);
  });

  return plan;
}

export function computePlanHash(input: {
  destinationBoardName: string;
  seedUsed: string;
  selectedPins: PlannedPin[];
}): string {
  const normalizedPayload = {
    destinationBoardName: input.destinationBoardName.trim(),
    seedUsed: input.seedUsed.trim(),
    selectedPins: input.selectedPins.map((pin) => ({
      id: pin.id.trim(),
      url: pin.url.trim()
    }))
  };

  return createHash("sha256").update(JSON.stringify(normalizedPayload)).digest("hex");
}

function dedupePins(pins: PlannedPin[]): PlannedPin[] {
  const map = new Map<string, PlannedPin>();

  for (const pin of pins) {
    const key = pin.id || pin.url;

    if (!map.has(key)) {
      map.set(key, pin);
    }
  }

  return Array.from(map.values());
}
