/**
 * Deeply merges two JSON objects.
 *
 * This function recursively merges the properties of the update object into the base object.
 * - If both corresponding properties are objects, they are merged recursively.
 * - If both properties are arrays, they are concatenated.
 * - For any other types, the update property overwrites the base property.
 *
 * Circular references are handled by tracking already merged objects using a WeakMap.
 * If the update value is null or undefined, the base value is returned unmodified.
 *
 * @typeParam B - The type of the base JSON object.
 * @typeParam U - The type of the update JSON object.
 * @param base - The base JSON object that will be merged into.
 * @param update - The JSON object containing updates.
 * @param seen - A WeakMap to track already processed objects for circular reference handling.
 * @returns A new JSON object resulting from the deep merge of the base and update objects.
 */
export function deepMergeJsons<B, U>(base: B, update: U, seen = new WeakMap<any, any>()): B & U {
	if (update === undefined || update === null) {
		return base as B & U;
	}
	if (seen.has(base)) {
		return seen.get(base);
	}

	const merged = { ...base } as B & U;
	seen.set(base, merged); // store merged early for circular references

	for (const key in update) {
		if (Object.prototype.hasOwnProperty.call(update, key)) {
			const preValue = base[key as keyof B];
			const posValue = update[key];
			if (isObject(preValue) && isObject(posValue)) {
				(merged as any)[key] = deepMergeJsons(preValue, posValue, seen);
			} else if (Array.isArray(preValue) && Array.isArray(posValue)) {
				(merged as any)[key] = [...preValue, ...posValue];
			} else {
				(merged as any)[key] = posValue;
			}
		}
	}
	return merged;
}

function isObject(item: any): item is Record<string, unknown> {
	return item !== null && typeof item === 'object' && !Array.isArray(item);
}
