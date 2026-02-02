export type PhysicsParams = {
  // Coefficient of restitution for ball-ball impacts (0..1)
  restitutionBall: number;
  // Coefficient of restitution for rail impacts (0..1)
  restitutionRail: number;
  // Linear rolling friction coefficient (units: 1/second). Higher = stops sooner.
  rollingFrictionPerSec: number;
  // Speeds below this are clamped to 0.
  stopSpeed: number;
  // Safety cap on collision iterations per step.
  maxSubsteps: number;
};

export const DEFAULT_PHYSICS_PARAMS: PhysicsParams = {
  restitutionBall: 0.93,
  restitutionRail: 0.85,
  rollingFrictionPerSec: 1.2,
  stopSpeed: 0.02,
  maxSubsteps: 24
};

