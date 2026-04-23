import type { RuleSet } from '../../../packages/rules-sdk/src/RuleSet';
import { aStarSearch } from '../../../packages/engine-spatial/pathfinding/AStar';

export const bad: [RuleSet | null, typeof aStarSearch | null] = [null, null];
