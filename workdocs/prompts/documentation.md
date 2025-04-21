## Tabnine prompts to generate decent documentation

### Root index file (/ts-doc-root)
 - scopes: file, workspace
```
You're a senior TypeScript developer writing JSDoc documentation for a class to be used with better-docs. Given the module code:
Generate a JSDoc comment block for a TypeScript module file using better-docs formatting:
- Add @module with the name of the module
- Add @description and @summary
- Do NOT document individual exports
- The summary should explain the role of the module and what it exposes (classes, utils, etc.)
- Include references to key exported objects using @link where appropriate

Respond with only the JSDoc block for the module file.
never omit or change any code
respond upon completion without additional input
```


### Index file (/ts-doc-index)
 - scopes: file, workspace
```
Act as a seasoned typescript developer.
The current document is the root of a namespace of a module.
Define documentation block with:
 - a @namespace tag using the appropriate name, given the folder it is on and all the files imported by the current one;
 - a thorough @description with a detailed analysis of the objective of the files in the current folder recrusively;
 - a @memberOf tag referencing the parent module;
also document all exported objects;
never omit or change any code
```


### Classes (/ts-doc-class)

```
Act as a seasoned typescript developer.
document the entire class and each of its functions including always including the @description tag with a short description of the target, and a@summary tag with a more detailed one.
Include @class tags when applicable.
include @param tags in the class documentation and its type definitions
Include detailed @description for all properties.
Include @template tags when necessary.
For methods and functions:
- include @description and @summary tags as defined for the target. also document every argument, including its type definition, and return type, referencing @template tags when necessary.
- create mermaid sequence diagrams under the @mermaid tag;

The order of tags  (when applicable) should be as follows:
1 - @description;
2 - @summary;
3 - @template;
4 - @param;
5 - @return;
6 - @class
7 - @mermaid;

ignore @mermaid for methods with less that 15 lines and constructors.
never omit or change any code
```

chat gpt generated:
```
You're a senior TypeScript developer writing JSDoc documentation for a class to be used with better-docs
Generate a JSDoc comment block for a TypeScript class file using better-docs formatting:
- @class tag including the name
- @description and @summary for the class
- @extends and @implements (if applicable)
- @template tags if the class is generic
- Do NOT document the constructor, but include the constructor arguments as @param in the class documentation
- For each class method (static and instance):
  - Add @description, @summary, @param, and @return tags
  - If the method has more than 10 lines, include a @mermaid sequence diagram
  - Include @private or @protected if applicable
  - Use @link when referring to other classes, types, or interfaces

Respond only with the full JSDoc comment block for the class and its methods.
refer to the module it belongs with @memberOf
never omit or change any code, including the constructor
```


### Interfaces and Types (/ts-doc-types)

```
Act as a seasoned typescript developer.
document the target code, always including the @description tag with a short description of the target, and a@summary tag with a more detailed one.
Include @interface and @typeDef an @template tags when appropriate.
Include detailed @description for all properties.
For methods, include @description and @summary tags as defined for the target. also document every argument, including its type definition, and return type, referencing @template tags when necessary.

The order of tags  (when applicable) should be as follows:
1 - @description;
2 - @summary;
3 - @template;
4 - @param;
5 - @return;
6 - @interface or @typeDef followed by the interface or type name;
8 - @memberOf referencing the appropriate namespace using the appropriate syntax
never omit or change any code
never omit or change any code
```

chat gpt generated:
```
You're a senior TypeScript developer documenting a TypeScript interface or type for better-docs using JSDoc. Given the code:
- If it's a type, use @typedef
- If it's an interface, use @interface
- Add @description and @summary for the interface/type
- Include @template for generic types
- For each method (in interfaces), include @param and @return
- For each property, document the purpose inline or using @property
- Use @link when referencing other types

Output only the completed JSDoc comment block for the type or interface.
refer to the module it belongs with @memberOf
never omit or change any code
```

### Functions (/ts-doc-functions)

```
Act as a seasoned typescript developer.
document the target code, always including the @description tag with a short description of the target, and a@summary tag with a more detailed one.
Include @function an @template tags when appropriate.
Include detailed @description for all properties.
For methods, include @description and @summary tags as defined for the target. also document every argument, including its type definition, and return type, referencing @template tags when necessary.
create mermaid sequence diagrams under the @mermaid tag;

The order of tags (when applicable) should be as follows:
1 - @description;
2 - @summary;
3 - @template;
4 - @param including type definitions;
5 - @return;
6 - @function followed by the interface or type name;
7 - @mermaid with the sequence diagram for the function if ithas over 10 lines
8 - @memberOf referencing the appropriate namespace using the appropriate syntax
never omit or change any code

```

chat gpt generated:
```
You're a senior TypeScript developer writing JSDoc documentation for a function to be used with better-docs:
- Add @function with the function name
- Add @description and @summary
- Include all @param and @return tags
- Add @template if the function is generic
- If the function body has more than 10 lines, include a @mermaid sequence diagram
- Use @link for references to other objects or types

Output only the full JSDoc comment block for the function.
refer to the module it belongs with @memberOf
never omit or change any code
```


### Constants and Enums (/ts-doc-const)

```
Act as a seasoned typescript developer.
document the target code, always including the @description tag with a short description of the target, and a@summary tag with a more detailed one.
Include @const and @typeDef tags when appropriate.
Include detailed @description for all properties.
For methods, include @description and @summary tags as defined for the target. also document every argument, including its type definition, and return type, referencing @template tags when necessary.

The order of tags  (when applicable) should be as follows:
1 - @description;
2 - @summary;
3 - @template;
4 - @property;
6 - @const followed by the const or enum name;
8 - @memberOf referencing the appropriate namespace using the appropriate syntax
never omit or change any code
```

chat gpt generated:
```
You're a senior TypeScript developer writing JSDoc documentation for a constant or enum for better-docs. Based on the code:
- Use @const with the variable name
- Add @description and @summary
- For enums, include @enum and @readonly, and add inline documentation for each member
- For object-like constants:
  - Create a @typedef with @property for each key
  - Reference it in the constant using @type
  - Alternatively, document each key inline if small

Respond with the JSDoc comment block(s) for both the typedef and the constant or enum.
refer to the module it belongs with @memberOf
never omit or change any code
```

### Scripts (/ts-doc-scripts)

```
Act as a seasoned typescript developer.
document the target script, always including the @description tag with a short description of its purpose, and a@summary tag with a more detailed one.
Include descriptions for the various arguments it acceppts
Include detailed @description for all functions.
Include @mermaid with the sequence diagram for the function if ithas over 10 lines

The order of tags  (when applicable) should be as follows:
1 - @description;
2 - @summary;
3 - @template;
4 - @param;
6 - @function followed by the const or enum name;
never omit or change any code
```


chat gpt generated:
```
You're a senior TypeScript developer writing JSDoc documentation for a command line script to be used with better-docs:
document the target script, always including the @description tag with a short description of its purpose, and a@summary tag with a more detailed one.
Include descriptions for the various arguments it acceppts
Include detailed @description for all functions.
Include @mermaid with the sequence diagram for the function if ithas over 10 lines
Use @link for references to other objects or types

Output only the full JSDoc comment block for the function.
refer to the module it belongs with @memberOf
never omit or change any code
```
