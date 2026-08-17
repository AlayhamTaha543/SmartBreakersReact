export interface CycleTiming {
  realSecondsPerCycle: number
  simulatedMinutesPerCycle: number
  twoCycleRealSeconds: number
  twoCycleSimulatedMinutes: number
}

export function cycleTiming(cycleSeconds: number, clockScale: number): CycleTiming {
  return {
    realSecondsPerCycle: cycleSeconds,
    simulatedMinutesPerCycle: cycleSeconds * clockScale / 60,
    twoCycleRealSeconds: cycleSeconds * 2,
    twoCycleSimulatedMinutes: cycleSeconds * clockScale * 2 / 60,
  }
}
