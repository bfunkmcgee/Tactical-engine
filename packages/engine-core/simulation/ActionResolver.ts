import {
  appendEvents,
  reduceEvents,
  type Action,
  type GameEvent,
  type GameState,
  type StateTransitionResult,
  type UnitState,
} from '../state/GameState';
import { SquareGridAdapter } from '../../engine-spatial/grid/GridAdapter';
import { LineOfSight } from '../../engine-spatial/los/LineOfSight';
import { Targeting } from '../../engine-spatial/range/Targeting';

interface ActionValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

interface AttackCandidatePayload {
  readonly targetId: string;
  readonly amount: number;
}

interface EndCommandCandidatePayload {
  readonly reason: 'manual';
}

interface PassCandidatePayload {
  readonly phase: GameState['phase'];
}

interface MoveCandidatePayload {
  readonly unitId: string;
  readonly to: { x: number; y: number };
}

interface UseAbilityCandidatePayload {
  readonly unitId: string;
  readonly abilityId: string;
  readonly targetId?: string;
}

interface UseItemCandidatePayload {
  readonly unitId: string;
  readonly itemId: string;
  readonly targetId?: string;
}

interface GridTargetPayload {
  readonly x: number;
  readonly y: number;
}

const ATTACK_PAYLOAD_KEYS: readonly string[] = ['amount', 'targetId'];
const END_COMMAND_PAYLOAD_KEYS: readonly string[] = ['reason'];
const PASS_PAYLOAD_KEYS: readonly string[] = ['phase'];
const MOVE_PAYLOAD_KEYS: readonly string[] = ['unitId', 'to'];
const USE_ABILITY_PAYLOAD_KEYS: readonly string[] = ['unitId', 'abilityId', 'targetId'];
const USE_ITEM_PAYLOAD_KEYS: readonly string[] = ['unitId', 'itemId', 'targetId'];
const DEFAULT_ATTACK_RANGE = 3;

export class ActionResolver {
  private readonly grid = new SquareGridAdapter();
  private readonly targeting = new Targeting(this.grid);

  public applyAction(state: GameState, action: Action): StateTransitionResult {
    const validation = this.validateActionWithReason(state, action);
    if (!validation.isValid) {
      return { state, events: [] };
    }

    const events = this.resolveActionEffects(state, action);
    const nextState = appendEvents(reduceEvents(state, events), events);
    return {
      state: nextState,
      events,
    };
  }

  public validateAction(state: GameState, action: Action): boolean {
    return this.validateActionWithReason(state, action).isValid;
  }

  public validateActionWithReason(state: GameState, action: Action): ActionValidationResult {
    const legalActions = this.getLegalActions(state, action.actorId);
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'NO_LEGAL_ACTIONS_FOR_ACTOR',
        details: { actorId: action.actorId, activeActorId: state.activeActorId, phase: state.phase },
      };
    }

    switch (action.type) {
      case 'ATTACK':
        return this.validateAttackAction(state, action, legalActions.filter((candidate) => candidate.type === 'ATTACK'));
      case 'END_COMMAND':
        return this.validateEndCommandAction(action, legalActions.filter((candidate) => candidate.type === 'END_COMMAND'));
      case 'MOVE':
        return this.validateMoveAction(action, legalActions.filter((candidate) => candidate.type === 'MOVE'));
      case 'USE_ABILITY':
        return this.validateUseAbilityAction(action, legalActions.filter((candidate) => candidate.type === 'USE_ABILITY'));
      case 'USE_ITEM':
        return this.validateUseItemAction(action, legalActions.filter((candidate) => candidate.type === 'USE_ITEM'));
      case 'PASS':
        return this.validatePassAction(action, legalActions.filter((candidate) => candidate.type === 'PASS'));
      default:
        return {
          isValid: false,
          reason: 'UNKNOWN_ACTION_TYPE',
          details: { type: String((action as { type?: unknown }).type ?? '') },
        };
    }
  }

  public resolveActionEffects(state: GameState, action: Action): GameEvent[] {
    if (!this.validateAction(state, action)) {
      return [];
    }

    const events: GameEvent[] = [
      {
        kind: 'ACTION_APPLIED',
        action,
        turn: state.turn,
        round: state.round,
      },
    ];
    if (action.type === 'MOVE') {
      const payload = this.toMoveCandidatePayload(action.payload);
      if (payload) {
        const movingUnit = state.units[payload.unitId];
        if (movingUnit?.position) {
          events.push({
            kind: 'UNIT_MOVED',
            unitId: payload.unitId,
            from: movingUnit.position,
            to: payload.to,
            turn: state.turn,
            round: state.round,
          });
        }
      }
    }

    if (action.type === 'USE_ABILITY') {
      const payload = this.toUseAbilityCandidatePayload(action.payload);
      if (payload) {
        events.push({
          kind: 'ABILITY_USED',
          unitId: payload.unitId,
          abilityId: payload.abilityId,
          targetId: payload.targetId,
          turn: state.turn,
          round: state.round,
        });
      }
    }

    if (action.type === 'USE_ITEM') {
      const payload = this.toUseItemCandidatePayload(action.payload);
      if (payload) {
        events.push({
          kind: 'ITEM_USED',
          unitId: payload.unitId,
          itemId: payload.itemId,
          targetId: payload.targetId,
          turn: state.turn,
          round: state.round,
        });
      }
    }

    return events;
  }

  public getLegalActions(state: GameState, actorId: string): Action[] {
    if (state.activeActorId !== actorId) {
      return [];
    }

    switch (state.phase) {
      case 'COMMAND': {
        const actorUnit = this.findActorUnit(state, actorId);
        const attackActions: Action[] = Object.values(state.units)
          .filter((unit) => unit.ownerId !== actorId && unit.hp > 0)
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((target) => ({
            id: `attack:${actorId}:${target.id}`,
            actorId,
            type: 'ATTACK',
            payload: { targetId: target.id, amount: 1 },
          }));

        const moveActions: Action[] =
          actorUnit?.position === undefined
            ? []
            : [
                {
                  id: `move:${actorId}:${actorUnit.id}:${actorUnit.position.x + 1}:${actorUnit.position.y}`,
                  actorId,
                  type: 'MOVE',
                  payload: {
                    unitId: actorUnit.id,
                    to: { x: actorUnit.position.x + 1, y: actorUnit.position.y },
                  },
                },
              ];

        const useAbilityActions: Action[] = actorUnit
          ? [
              {
                id: `use-ability:${actorId}:${actorUnit.id}:basic-strike`,
                actorId,
                type: 'USE_ABILITY',
                payload: {
                  unitId: actorUnit.id,
                  abilityId: 'basic-strike',
                  targetId: attackActions.length > 0 ? (attackActions[0]?.payload as { targetId?: string })?.targetId : undefined,
                },
              },
            ]
          : [];

        const useItemActions: Action[] = actorUnit
          ? [
              {
                id: `use-item:${actorId}:${actorUnit.id}:basic-potion`,
                actorId,
                type: 'USE_ITEM',
                payload: {
                  unitId: actorUnit.id,
                  itemId: 'basic-potion',
                  targetId: actorUnit.id,
                },
              },
            ]
          : [];

        return [
          ...attackActions,
          ...moveActions,
          ...useAbilityActions,
          ...useItemActions,
          {
            id: `end-command:${actorId}`,
            actorId,
            type: 'END_COMMAND',
            payload: { reason: 'manual' },
          },
        ];
      }

      case 'RESOLUTION':
      case 'START_TURN':
      case 'END_TURN':
        return [
          {
            id: `pass:${actorId}:${state.phase}`,
            actorId,
            type: 'PASS',
            payload: { phase: state.phase },
          },
        ];

      default:
        return [];
    }
  }

  private validateAttackAction(state: GameState, action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'ATTACK_NOT_LEGAL_IN_PHASE',
        details: { phase: state.phase },
      };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return {
        isValid: false,
        reason: 'INVALID_ATTACK_PAYLOAD_TYPE',
        details: { expected: 'object' },
      };
    }

    const keyValidation = this.validateAllowedKeys(payload, ATTACK_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const targetId = payload.targetId;
    const amountValue = payload.amount;

    if (typeof targetId !== 'string' || targetId.length === 0) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_REQUIRED',
      };
    }

    if (amountValue !== undefined && (typeof amountValue !== 'number' || !Number.isInteger(amountValue) || amountValue <= 0)) {
      return {
        isValid: false,
        reason: 'ATTACK_AMOUNT_INVALID',
        details: { amount: String(amountValue) },
      };
    }

    const normalizedAmount = amountValue === undefined ? 1 : (amountValue as number);
    const canonicalPayload: AttackCandidatePayload = {
      targetId,
      amount: normalizedAmount,
    };

    const matchingCandidate = legalActions.find((candidate) => {
      if (candidate.type !== 'ATTACK' || candidate.actorId !== action.actorId || candidate.id !== action.id) {
        return false;
      }
      const candidatePayload = this.toAttackCandidatePayload(candidate.payload);
      return Boolean(candidatePayload && this.attackPayloadEquals(candidatePayload, canonicalPayload));
    });

    if (!matchingCandidate) {
      return {
        isValid: false,
        reason: 'ATTACK_NOT_FOUND_IN_LEGAL_ACTIONS',
        details: { actorId: action.actorId, targetId },
      };
    }

    const target = state.units[targetId];
    if (!target || target.hp <= 0) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_NOT_ALIVE',
        details: { targetId },
      };
    }

    const actorUnit = this.findActorUnit(state, action.actorId);
    if (!actorUnit) {
      return {
        isValid: false,
        reason: 'ATTACK_SOURCE_NOT_FOUND',
        details: { actorId: action.actorId },
      };
    }

    if (!this.targetHasValidOccupancy(state, target)) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_OCCUPANCY_INVALID',
        details: { targetId },
      };
    }

    if (this.isOutOfRange(actorUnit, target, matchingCandidate)) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_OUT_OF_RANGE',
        details: { actorId: action.actorId, targetId },
      };
    }

    if (!this.hasLineOfSight(state, actorUnit, target)) {
      return {
        isValid: false,
        reason: 'ATTACK_TARGET_NO_LINE_OF_SIGHT',
        details: { actorId: action.actorId, targetId },
      };
    }

    return { isValid: true };
  }

  private validateEndCommandAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'END_COMMAND_NOT_LEGAL_IN_PHASE',
      };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return {
        isValid: false,
        reason: 'INVALID_END_COMMAND_PAYLOAD_TYPE',
      };
    }

    const keyValidation = this.validateAllowedKeys(payload, END_COMMAND_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const reason = payload.reason;
    if (reason !== 'manual') {
      return {
        isValid: false,
        reason: 'END_COMMAND_REASON_INVALID',
        details: { reason: String(reason) },
      };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'END_COMMAND' &&
        this.endCommandPayloadEquals(candidate.payload, { reason: 'manual' }),
    );

    return hasMatch
      ? { isValid: true }
      : {
          isValid: false,
          reason: 'END_COMMAND_NOT_FOUND_IN_LEGAL_ACTIONS',
          details: { actorId: action.actorId },
        };
  }

  private validatePassAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return {
        isValid: false,
        reason: 'PASS_NOT_LEGAL_IN_PHASE',
      };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return {
        isValid: false,
        reason: 'INVALID_PASS_PAYLOAD_TYPE',
      };
    }

    const keyValidation = this.validateAllowedKeys(payload, PASS_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const phase = payload.phase;
    if (typeof phase !== 'string') {
      return {
        isValid: false,
        reason: 'PASS_PHASE_REQUIRED',
      };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'PASS' &&
        this.passPayloadEquals(candidate.payload, { phase: phase as GameState['phase'] }),
    );

    return hasMatch
      ? { isValid: true }
      : {
          isValid: false,
          reason: 'PASS_NOT_FOUND_IN_LEGAL_ACTIONS',
          details: { actorId: action.actorId, phase },
        };
  }

  private validateMoveAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'MOVE_NOT_LEGAL_IN_PHASE' };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_MOVE_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, MOVE_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toMoveCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'MOVE_PAYLOAD_INVALID' };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'MOVE' &&
        this.movePayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'MOVE_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateUseAbilityAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'USE_ABILITY_NOT_LEGAL_IN_PHASE' };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_USE_ABILITY_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, USE_ABILITY_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toUseAbilityCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'USE_ABILITY_PAYLOAD_INVALID' };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'USE_ABILITY' &&
        this.useAbilityPayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'USE_ABILITY_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateUseItemAction(action: Action, legalActions: Action[]): ActionValidationResult {
    if (legalActions.length === 0) {
      return { isValid: false, reason: 'USE_ITEM_NOT_LEGAL_IN_PHASE' };
    }

    const payload = this.toRecord(action.payload);
    if (!payload) {
      return { isValid: false, reason: 'INVALID_USE_ITEM_PAYLOAD_TYPE' };
    }

    const keyValidation = this.validateAllowedKeys(payload, USE_ITEM_PAYLOAD_KEYS);
    if (!keyValidation.isValid) {
      return keyValidation;
    }

    const normalized = this.toUseItemCandidatePayload(action.payload);
    if (!normalized) {
      return { isValid: false, reason: 'USE_ITEM_PAYLOAD_INVALID' };
    }

    const hasMatch = legalActions.some(
      (candidate) =>
        candidate.id === action.id &&
        candidate.actorId === action.actorId &&
        candidate.type === 'USE_ITEM' &&
        this.useItemPayloadEquals(candidate.payload, normalized),
    );

    return hasMatch ? { isValid: true } : { isValid: false, reason: 'USE_ITEM_NOT_FOUND_IN_LEGAL_ACTIONS' };
  }

  private validateAllowedKeys(
    payload: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): ActionValidationResult {
    const extraneous = Object.keys(payload).filter((key) => allowedKeys.indexOf(key) === -1);
    if (extraneous.length > 0) {
      return {
        isValid: false,
        reason: 'PAYLOAD_KEYS_NOT_ALLOWED',
        details: { keys: extraneous.join(',') },
      };
    }

    return { isValid: true };
  }

  private attackPayloadEquals(left: AttackCandidatePayload, right: AttackCandidatePayload): boolean {
    return left.targetId === right.targetId && left.amount === right.amount;
  }

  private endCommandPayloadEquals(payload: Action['payload'], candidate: EndCommandCandidatePayload): boolean {
    const normalized = this.toEndCommandCandidatePayload(payload);
    return Boolean(normalized && normalized.reason === candidate.reason);
  }

  private passPayloadEquals(payload: Action['payload'], candidate: PassCandidatePayload): boolean {
    const normalized = this.toPassCandidatePayload(payload);
    return Boolean(normalized && normalized.phase === candidate.phase);
  }

  private movePayloadEquals(payload: Action['payload'], candidate: MoveCandidatePayload): boolean {
    const normalized = this.toMoveCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.unitId === candidate.unitId &&
        normalized.to.x === candidate.to.x &&
        normalized.to.y === candidate.to.y,
    );
  }

  private useAbilityPayloadEquals(payload: Action['payload'], candidate: UseAbilityCandidatePayload): boolean {
    const normalized = this.toUseAbilityCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.unitId === candidate.unitId &&
        normalized.abilityId === candidate.abilityId &&
        normalized.targetId === candidate.targetId,
    );
  }

  private useItemPayloadEquals(payload: Action['payload'], candidate: UseItemCandidatePayload): boolean {
    const normalized = this.toUseItemCandidatePayload(payload);
    return Boolean(
      normalized &&
        normalized.unitId === candidate.unitId &&
        normalized.itemId === candidate.itemId &&
        normalized.targetId === candidate.targetId,
    );
  }

  private toAttackCandidatePayload(payload: Action['payload']): AttackCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record) {
      return undefined;
    }

    if (typeof record.targetId !== 'string') {
      return undefined;
    }

    const amountValue = record.amount;
    if (
      amountValue !== undefined &&
      (typeof amountValue !== 'number' || !Number.isInteger(amountValue) || amountValue <= 0)
    ) {
      return undefined;
    }

    const normalizedAmount = amountValue === undefined ? 1 : amountValue;
    return {
      targetId: record.targetId,
      amount: normalizedAmount,
    };
  }

  private toEndCommandCandidatePayload(payload: Action['payload']): EndCommandCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || record.reason !== 'manual') {
      return undefined;
    }

    return { reason: 'manual' };
  }

  private toPassCandidatePayload(payload: Action['payload']): PassCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.phase !== 'string') {
      return undefined;
    }

    return { phase: record.phase as GameState['phase'] };
  }

  private toMoveCandidatePayload(payload: Action['payload']): MoveCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.unitId !== 'string') {
      return undefined;
    }

    const to = this.toGridTarget(record.to);
    if (!to) {
      return undefined;
    }

    return { unitId: record.unitId, to: { x: to.x, y: to.y } };
  }

  private toUseAbilityCandidatePayload(payload: Action['payload']): UseAbilityCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.unitId !== 'string' || typeof record.abilityId !== 'string') {
      return undefined;
    }

    if (record.targetId !== undefined && typeof record.targetId !== 'string') {
      return undefined;
    }

    return {
      unitId: record.unitId,
      abilityId: record.abilityId,
      targetId: typeof record.targetId === 'string' ? record.targetId : undefined,
    };
  }

  private toUseItemCandidatePayload(payload: Action['payload']): UseItemCandidatePayload | undefined {
    const record = this.toRecord(payload);
    if (!record || typeof record.unitId !== 'string' || typeof record.itemId !== 'string') {
      return undefined;
    }

    if (record.targetId !== undefined && typeof record.targetId !== 'string') {
      return undefined;
    }

    return {
      unitId: record.unitId,
      itemId: record.itemId,
      targetId: typeof record.targetId === 'string' ? record.targetId : undefined,
    };
  }

  private toRecord(payload: Action['payload']): Record<string, unknown> | undefined {
    if (!this.isPlainRecord(payload)) {
      return undefined;
    }

    return payload;
  }

  private toGridTarget(value: unknown): GridTargetPayload | undefined {
    if (!this.isPlainRecord(value)) {
      return undefined;
    }

    const { x, y } = value;
    if (typeof x !== 'number' || !Number.isInteger(x) || typeof y !== 'number' || !Number.isInteger(y)) {
      return undefined;
    }

    return { x, y };
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
  }

  private findActorUnit(state: GameState, actorId: string): UnitState | undefined {
    return Object.values(state.units).find((unit) => unit.ownerId === actorId && unit.hp > 0);
  }

  private isOutOfRange(actorUnit: UnitState, targetUnit: UnitState, action: Action): boolean {
    const payload = this.toRecord(action.payload);
    const actorPosition = this.toCell(actorUnit);
    const targetPosition = this.toCell(targetUnit);

    if (!actorPosition || !targetPosition) {
      return false;
    }

    const configuredRange = payload?.range;
    const maxRange = typeof configuredRange === 'number' && configuredRange >= 0 ? configuredRange : DEFAULT_ATTACK_RANGE;
    const attackableCells = this.targeting.getTargetCells({
      origin: actorPosition,
      minRange: 1,
      maxRange,
      aoePattern: [{ q: 0, r: 0 }],
    });
    const inRange = attackableCells.some((cell) => cell.target.q === targetPosition.q && cell.target.r === targetPosition.r);

    return !inRange;
  }

  private hasLineOfSight(state: GameState, actorUnit: UnitState, targetUnit: UnitState): boolean {
    const actorPosition = this.toCell(actorUnit);
    const targetPosition = this.toCell(targetUnit);
    if (!actorPosition || !targetPosition) {
      return true;
    }

    const occupiedCells = new Set<string>();
    for (const unit of Object.values(state.units)) {
      const cell = this.toCell(unit);
      if (!cell || unit.hp <= 0) {
        continue;
      }
      if (
        (cell.q === actorPosition.q && cell.r === actorPosition.r) ||
        (cell.q === targetPosition.q && cell.r === targetPosition.r)
      ) {
        continue;
      }

      occupiedCells.add(this.toCellKey(cell.q, cell.r));
    }

    const los = new LineOfSight({
      getObstacle: (cell) => (occupiedCells.has(this.toCellKey(cell.q, cell.r)) ? 'hard' : 'none'),
      getCoverValue: () => 0,
    });
    los.setTurn(state.turn);
    return los.query(actorPosition, targetPosition).visible;
  }

  private targetHasValidOccupancy(state: GameState, targetUnit: UnitState): boolean {
    const targetCell = this.toCell(targetUnit);
    if (!targetCell) {
      return false;
    }

    return Object.values(state.units).some((unit) => {
      if (unit.id !== targetUnit.id || unit.hp <= 0) {
        return false;
      }

      const cell = this.toCell(unit);
      return Boolean(cell && cell.q === targetCell.q && cell.r === targetCell.r);
    });
  }

  private toCell(unit: UnitState): { q: number; r: number } | undefined {
    if (unit.spatialRef) {
      return { q: unit.spatialRef.q, r: unit.spatialRef.r };
    }
    if (unit.position) {
      return { q: unit.position.x, r: unit.position.y };
    }
    return undefined;
  }

  private toCellKey(q: number, r: number): string {
    return `${q},${r}`;
  }
}
