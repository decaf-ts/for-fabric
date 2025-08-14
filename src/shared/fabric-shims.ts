import "reflect-metadata";

const logger = {
  info: console.log,
  debug: console.debug,
  error: console.error,
};

export type GetCertificatesRequest = {
  id?: string;
  aki?: string;
  serial?: string;
  revoked_start?: string;
  revoked_end?: string;
  expired_start?: string;
  expired_end?: string;
  notrevoked?: boolean;
  notexpired?: boolean;
  ca?: string;
};

export type CertificateResponse = {
  caname: string;
  certs: { PEM: string }[];
};

export type FabricIdentity = {
  id: string;
  type: string;
  affiliation: string;
  attrs: { name: string; value: string }[];
  max_enrollments: number;
};

export type IdentityResponse = {
  caname: string;
  identities: FabricIdentity[];
};

const getProto = function (prototype: any) {
  return Object.getPrototypeOf(prototype);
};

function isPrimitive(type: string) {
  const lowerCase = type.toLowerCase();
  switch (lowerCase) {
    case "string":
    case "number":
    case "boolean":
      return lowerCase;

    default:
      return undefined;
  }
}

const refPath = "#/components/schemas/";

function isArrowedArray(type: string) {
  return /^Array<[A-z].*>$/.test(type);
}

function isBracketArray(type: string) {
  return /^[A-z].*(\[\])+?/.test(type);
}

function isArray(type: string) {
  return isArrowedArray(type) || isBracketArray(type);
}

function isMap(type: string) {
  return /^Map<[A-z].*,\s?[A-z].*>$/.test(type);
}

function getSubArray(type: string) {
  if (isArrowedArray(type)) {
    return type.replace("Array<", "").replace(">", "");
  }

  return type.replace("[]", "");
}

function getSubMap(type: string) {
  return type.replace(/^Map<[A-z].*?,\s?/, "").replace(">", "");
}

function generateSchema(type: string, fullPath = true): any {
  if (isPrimitive(type)) {
    return {
      type: type.toLowerCase(),
    };
  } else if (isArray(type)) {
    const subType = getSubArray(type);

    return {
      type: "array",
      items: generateSchema(subType, fullPath),
    };
  } else if (isMap(type)) {
    const subType = getSubMap(type);

    return {
      type: "object",
      additionalProperties: generateSchema(subType, fullPath),
    };
  }

  return {
    $ref: (fullPath ? refPath : "") + type,
  };
}

export function FabricProperty(name?: string, type?: string) {
  return (target: any, propertyKey: string) => {
    logger.debug(
      "@Property args:",
      `Property Key -> ${propertyKey}, Name -> ${name}, Type -> ${type},`,
      "Target ->",
      target.constructor.name
    );

    const properties =
      Reflect.getOwnMetadata("fabric:object-properties", target) || {};

    logger.debug("Existing fabric:object-properties for target", properties);

    if (!name || !type) {
      name = propertyKey;

      const metaType = Reflect.getMetadata("design:type", target, propertyKey);
      type =
        typeof metaType === "function" ? metaType.name : metaType.toString();
    }

    properties[name] = generateSchema(type as string, false);

    Reflect.defineMetadata("fabric:object-properties", properties, target);

    logger.debug("Updated fabric:object-properties for target", properties);
  };
}
export function FabricObject(opts?: any) {
  return (target: any) => {
    logger.info("@Object args: Target -> %s", target.constructor.name);

    const objects = Reflect.getMetadata("fabric:objects", globalThis) || {};

    logger.debug("Existing fabric:objects %s", objects);

    const properties =
      Reflect.getMetadata("fabric:object-properties", target.prototype) || {};

    logger.debug("Existing fabric:object-properties for target", properties);

    // check for the presence of a supertype
    const supertype = getProto(target.prototype).constructor.name;

    if (supertype === "Object") {
      objects[target.name] = {
        $id: target.name,
        type: "object",
        cnstr: target,
        properties: properties,
      };

      // add in the discriminator property name if one has been supplied in the object annotations
      if (opts && opts.discriminator) {
        objects[target.name].discriminator = {
          propertyName: opts.discriminator,
        };
      }
    } else {
      objects[target.name] = {
        $id: target.name,
        cnstr: target,
        allOf: [
          {
            type: "object",
            properties: properties,
          },
          {
            $ref: `${supertype}`,
          },
        ],
      };
    }

    Reflect.defineMetadata("fabric:objects", objects, globalThis);

    logger.debug("Updated fabric:objects", objects);
  };
}
