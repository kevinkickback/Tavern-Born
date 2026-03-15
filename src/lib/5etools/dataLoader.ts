import { DataSourceConfig, GameData } from "@/types/5etools";
import {
	parseRaces,
	parseClasses,
	parseBackgrounds,
	parseSpells,
	parseFeats,
	parseItems,
	parseClassFeatures,
	parseActions,
	parseConditions,
	parseDeities,
	parseSkills,
	parseSenses,
	parseLanguages,
	parseMagicVariants,
	parseOptionalFeatures,
	parseVariantRules,
	buildSourcesList,
} from "./parsers";

export interface DataLoaderOptions {
	onProgress?: (current: number, total: number, resource: string) => void;
	signal?: AbortSignal;
}

export class FiveEToolsDataLoader {
	private baseUrl: string;
	private isRemote: boolean;

	constructor(config: DataSourceConfig) {
		this.baseUrl = config.path;
		this.isRemote = config.type === "remote";
	}

	async loadAllData(options?: DataLoaderOptions): Promise<GameData> {
		const resources = [
			{ key: "books", file: "books.json" },
			{ key: "races", file: "races.json" },
			{ key: "classIndex", file: "class/index.json" },
			{ key: "backgrounds", file: "backgrounds.json" },
			{ key: "spellIndex", file: "spells/index.json" },
			{ key: "feats", file: "feats.json" },
			{ key: "items", file: "items.json" },
			{ key: "itemsBase", file: "items-base.json" },
			{ key: "actions", file: "actions.json" },
			{ key: "conditions", file: "conditionsdiseases.json" },
			{ key: "deities", file: "deities.json" },
			{ key: "skills", file: "skills.json" },
			{ key: "senses", file: "senses.json" },
			{ key: "languages", file: "languages.json" },
			{ key: "magicvariants", file: "magicvariants.json" },
			{ key: "optionalfeatures", file: "optionalfeatures.json" },
			{ key: "variantrules", file: "variantrules.json" },
		];

		const gameData: GameData = {
			races: [],
			classes: [],
			backgrounds: [],
			spells: [],
			feats: [],
			items: [],
			itemsBase: [],
			classFeatures: [],
			actions: [],
			conditions: [],
			deities: [],
			skills: [],
			senses: [],
			languages: [],
			magicvariants: [],
			optionalfeatures: [],
			variantrules: [],
			sources: [],
		};

		const sourcesSet = new Set<string>();
		let booksData: any = null;
		let classIndexData: any = null;
		let spellIndexData: any = null;

		for (let i = 0; i < resources.length; i++) {
			const resource = resources[i];

			if (options?.onProgress) {
				options.onProgress(i, resources.length, resource.file);
			}

			if (options?.signal?.aborted) {
				throw new Error("Data loading aborted");
			}

			try {
				const data = await this.loadResource(resource.file, options?.signal);

				switch (resource.key) {
					case "books":
						booksData = data;
						break;
					case "classIndex":
						classIndexData = data;
						break;
					case "spellIndex":
						spellIndexData = data;
						break;
					case "races":
						gameData.races = parseRaces(data) as any;
						gameData.races.forEach((item) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "backgrounds":
						gameData.backgrounds = parseBackgrounds(data) as any;
						gameData.backgrounds.forEach((item) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "feats":
						gameData.feats = parseFeats(data) as any;
						gameData.feats.forEach((item) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "items":
						gameData.items = parseItems(data) as any;
						gameData.items.forEach((item) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "itemsBase":
						gameData.itemsBase = parseItems(data) as any;
						gameData.itemsBase.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "actions":
						gameData.actions = parseActions(data);
						gameData.actions.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "conditions":
						gameData.conditions = parseConditions(data);
						gameData.conditions.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "deities":
						gameData.deities = parseDeities(data);
						gameData.deities.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "skills":
						gameData.skills = parseSkills(data);
						gameData.skills.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "senses":
						gameData.senses = parseSenses(data);
						gameData.senses.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "languages":
						gameData.languages = parseLanguages(data);
						gameData.languages.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "magicvariants":
						gameData.magicvariants = parseMagicVariants(data);
						gameData.magicvariants.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "optionalfeatures":
						gameData.optionalfeatures = parseOptionalFeatures(data);
						gameData.optionalfeatures.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
					case "variantrules":
						gameData.variantrules = parseVariantRules(data);
						gameData.variantrules.forEach((item: any) => {
							if (item.source) {
								sourcesSet.add(item.source);
							}
						});
						break;
				}
			} catch (error) {
				console.warn(`Failed to load ${resource.file}:`, error);
			}
		}

		if (classIndexData) {
			await this.loadClassData(classIndexData, gameData, sourcesSet, options);
		}

		if (spellIndexData) {
			await this.loadSpellData(spellIndexData, gameData, sourcesSet, options);
		}

		gameData.sources = buildSourcesList(Array.from(sourcesSet), booksData);

		if (options?.onProgress) {
			options.onProgress(resources.length, resources.length, "Complete");
		}

		return gameData;
	}

	private async loadClassData(
		indexData: any,
		gameData: GameData,
		sourcesSet: Set<string>,
		options?: DataLoaderOptions,
	): Promise<void> {
		const classFiles = this.extractClassFiles(indexData);

		const allClasses: any[] = [];
		const allClassFeatures: any[] = [];

		for (const classFile of classFiles) {
			try {
				const classData = await this.loadResource(
					`class/${classFile}`,
					options?.signal,
				);

				const parsedClasses = parseClasses(classData);
				allClasses.push(...parsedClasses);
				parsedClasses.forEach((item) => {
					if (item.source) {
						sourcesSet.add(item.source);
					}
				});

				const parsedFeatures = parseClassFeatures(classData);
				allClassFeatures.push(...parsedFeatures);
				parsedFeatures.forEach((item) => {
					if (item.source) {
						sourcesSet.add(item.source);
					}
				});
			} catch (error) {
				console.warn(`Failed to load class file ${classFile}:`, error);
			}
		}

		gameData.classes = allClasses;
		gameData.classFeatures = allClassFeatures;
	}

	private async loadSpellData(
		indexData: any,
		gameData: GameData,
		sourcesSet: Set<string>,
		options?: DataLoaderOptions,
	): Promise<void> {
		const spellFiles = this.extractSpellFiles(indexData);

		const allSpells: any[] = [];

		for (const spellFile of spellFiles) {
			try {
				const spellData = await this.loadResource(
					`spells/${spellFile}`,
					options?.signal,
				);

				const parsedSpells = parseSpells(spellData);
				allSpells.push(...parsedSpells);
				parsedSpells.forEach((item) => {
					if (item.source) {
						sourcesSet.add(item.source);
					}
				});
			} catch (error) {
				console.warn(`Failed to load spell file ${spellFile}:`, error);
			}
		}

		gameData.spells = allSpells;
	}

	private extractClassFiles(indexData: any): string[] {
		const files: string[] = [];

		if (Array.isArray(indexData)) {
			indexData.forEach((item) => {
				if (typeof item === "string") {
					files.push(item);
				}
			});
		} else if (typeof indexData === "object" && indexData !== null) {
			Object.values(indexData).forEach((value) => {
				if (typeof value === "string") {
					files.push(value);
				} else if (Array.isArray(value)) {
					value.forEach((item) => {
						if (typeof item === "string") {
							files.push(item);
						}
					});
				}
			});
		}

		return files;
	}

	private extractSpellFiles(indexData: any): string[] {
		const files: string[] = [];

		if (Array.isArray(indexData)) {
			indexData.forEach((item) => {
				if (typeof item === "string") {
					files.push(item);
				}
			});
		} else if (typeof indexData === "object" && indexData !== null) {
			Object.values(indexData).forEach((value) => {
				if (typeof value === "string") {
					files.push(value);
				} else if (Array.isArray(value)) {
					value.forEach((item) => {
						if (typeof item === "string") {
							files.push(item);
						}
					});
				}
			});
		}

		return files;
	}

	private async loadResource(
		filename: string,
		signal?: AbortSignal,
	): Promise<any> {
		if (!this.isRemote) {
			const sep = this.baseUrl.includes("\\") ? "\\" : "/";
			const fullPath = `${this.baseUrl}${sep}${filename.replace(/\//g, sep)}`;
			return window.electronAPI.readLocalJson(fullPath);
		}

		const url = this.buildUrl(filename);
		const response = await fetch(url, { signal });
		if (!response.ok) {
			throw new Error(`Failed to fetch ${filename}: ${response.statusText}`);
		}
		return await response.json();
	}

	private buildUrl(filename: string): string {
		if (this.isRemote) {
			if (
				filename.startsWith("class/") ||
				filename.startsWith("books/") ||
				filename.startsWith("spells/")
			) {
				return `${this.baseUrl}${this.baseUrl.endsWith("/") ? "" : "/"}data/${filename}`;
			}
			return `${this.baseUrl}${this.baseUrl.endsWith("/") ? "" : "/"}data/${filename}`;
		}
		return `${this.baseUrl}${this.baseUrl.endsWith("/") ? "" : "/"}${filename}`;
	}
}

export async function loadDataFromSource(
	config: DataSourceConfig,
	options?: DataLoaderOptions,
): Promise<GameData> {
	const loader = new FiveEToolsDataLoader(config);
	return await loader.loadAllData(options);
}
