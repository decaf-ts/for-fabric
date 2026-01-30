import { allowIf, AuthorizationError } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";

export function mspHandler(...args: any[]) {
  const context = args.shift();
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
  const context = args.shift();
  if (!context)
    throw new InternalError("Context is required for namespace authorization");
  const { role, namespace } = args.pop();
  if (!namespace)
    throw new InternalError(
      "namespace is required for namespace authorization"
    );
  const { clientIdentity } = context;
  let roles: string[];
  try {
    roles = JSON.parse(clientIdentity.getAttributeValue("roles")) as string[];
  } catch (e: unknown) {
    return new AuthorizationError(
      `Namespace authorization no namespaces found: ${e}`
    );
  }
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
  return allowIf(mspHandler, msp);
}

export function onlyNamespaceRole(namespace: string, role?: string) {
  return allowIf(namespaceHandler, { namespace: namespace, role: role });
}
