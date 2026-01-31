import {
  AuthHandler,
  AuthorizationError,
  ContextualLoggedClass,
} from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { MissingContextError } from "../../shared/index";

export function hlfAllowIf(handler: AuthHandler, ...argz: any[]) {
  return function allowIf(target: object, propertyKey?: any, descriptor?: any) {
    descriptor.value = new Proxy(descriptor.value, {
      async apply(target, thisArg: ContextualLoggedClass<any>, args) {
        const context = args.shift();
        if (!context || !(context as any).stub)
          throw new MissingContextError(
            `"invalid context provided. this decorator only works on fabric contract methods`
          );
        const { ctx, ctxArgs } = await thisArg["logCtx"](
          [...args, context],
          target.name,
          true
        );
        let error: void | AuthorizationError;
        try {
          error = handler(...args, ...argz, ctx);
        } catch (e: unknown) {
          throw new InternalError(
            `Failed to execute auth validation handler: ${e}`
          );
        }
        if (error) throw error;
        return target.call(thisArg, ctx, ...args);
      },
    });
  };
}

export function mspHandler(...args: any[]) {
  const context = args.pop();
  if (!context)
    throw new InternalError("Context is required for namespace authorization");
  const msp = args.pop();
  if (!msp)
    throw new InternalError("Msp is required for namespace authorization");
  const { stub } = context;
  const { mspid } = stub.getCreator();
  if (mspid !== msp)
    return new AuthorizationError(
      `Namespace authorization failed for msp: ${mspid}. only ${msp} can access`
    );
}

export function namespaceHandler(...args: any[]) {
  const context = args.pop();
  if (!context)
    throw new InternalError("Context is required for namespace authorization");
  const { role, namespace } = args.pop();
  if (!namespace)
    throw new InternalError(
      "namespace is required for namespace authorization"
    );
  const { identity } = context;
  let roles: string[];
  try {
    roles = JSON.parse(identity.getAttributeValue("roles")) as string[];
  } catch (e: unknown) {
    return new AuthorizationError(
      `Namespace authorization no namespaces found: ${e}`
    );
  }

  if (!roles)
    return new AuthorizationError(
      `no roles or namespaces found for namespace authorization`
    );

  const allowedNamespaces = [
    ...new Set(roles.map((role) => role.split(/[:-]/g)[0])),
  ];

  if (!allowedNamespaces.includes(namespace))
    return new AuthorizationError(
      `Namespace authorization error: ${namespace} required`
    );

  if (!role) return;

  const allowedRoles = roles.reduce(
    (acc, el) => {
      const [namespace, role] = el.split(/[:-]/g);
      acc[namespace] = acc[namespace] || [];
      acc[namespace].push(role);
      return acc;
    },
    {} as Record<string, string[]>
  );

  if (!allowedRoles[namespace] || !allowedRoles[namespace].includes(role))
    return new AuthorizationError(
      `Role authorization error: ${role} role required for namespace ${namespace}. Roles found: ${allowedRoles[namespace] && allowedRoles[namespace].length ? allowedRoles[namespace] : "none"}`
    );
}

export function onlyMsp(msp: string) {
  return hlfAllowIf(mspHandler, msp);
}

export function onlyNamespaceRole(namespace: string, role?: string) {
  return hlfAllowIf(namespaceHandler, { namespace: namespace, role: role });
}
