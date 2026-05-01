import { Engine } from '../Engine';
import { ActionResolver } from '../ActionResolver';
import { TurnManager } from '../TurnManager';

new Engine();
new Engine({});
new Engine({ actionResolver: new ActionResolver(), turnManager: new TurnManager() });

// @ts-expect-error Engine constructor no longer accepts positional dependencies.
new Engine(new ActionResolver());

// @ts-expect-error Engine constructor no longer accepts positional dependency lists.
new Engine(new ActionResolver(), new TurnManager());
