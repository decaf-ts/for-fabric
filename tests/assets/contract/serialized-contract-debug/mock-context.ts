import {
  Context,
  ContextArgs,
  Contextual,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Constructor, Model } from "@decaf-ts/decorator-validation";

export async function args<
  M extends Model,
  C extends Context<F>,
  F extends RepositoryFlags,
>(
  operation:
    | OperationKeys.CREATE
    | OperationKeys.READ
    | OperationKeys.UPDATE
    | OperationKeys.DELETE,
  model: Constructor<M>,
  args: any[],
  contextual?: Contextual<F>,
  overrides?: Partial<F>
): Promise<ContextArgs<F, C>> {
  const last = args.pop();

  async function getContext() {
    if (contextual)
      return contextual.context(operation, overrides || {}, model, ...args);
    return Context.from(operation, overrides || {}, model, ...args);
  }

  let c: C;
  if (last) {
    if (last instanceof Context) {
      c = last as C;
      args.push(last);
    } else {
      args.push(last);
      c = (await getContext()) as C;
      args.push(c);
    }
  } else {
    c = (await getContext()) as C;
    args.push(c);
  }

  return { context: c, args: args };
}
