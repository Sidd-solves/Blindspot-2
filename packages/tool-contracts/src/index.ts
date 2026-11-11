import { registerTools } from './core';
import { DATA_TOOLS } from './tools/data';
import { VIZ_TOOLS } from './tools/viz';
import { DESIGN_TOOLS } from './tools/design';
import { INTERACTION_TOOLS } from './tools/interact';
import { INTERPRET_TOOLS } from './tools/interpret';
import { OPS_TOOLS } from './tools/ops';
import { EXTRA_TOOLS } from './tools/extras';
import { EXPLORE_TOOLS } from './tools/explore';

export const ALL_TOOLS = [
  ...DATA_TOOLS,
  ...VIZ_TOOLS,
  ...DESIGN_TOOLS,
  ...INTERACTION_TOOLS,
  ...INTERPRET_TOOLS,
  ...OPS_TOOLS,
  ...EXTRA_TOOLS,
  ...EXPLORE_TOOLS,
];
registerTools(ALL_TOOLS);

export * from './core';
export * from './protocol';
export * from './guardrails';
export { ComponentSpec } from './tools/ops';
export { DashboardSpecSchema } from './tools/design';
export { GenericHypothesisSchema } from './tools/explore';
