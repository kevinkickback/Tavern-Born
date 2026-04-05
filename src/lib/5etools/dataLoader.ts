import type { DataSourceConfig, GameData } from '@/types/5etools';
import {
  buildSourcesList,
  parseActions,
  parseBackgrounds,
  parseClasses,
  parseClassFeatures,
  parseConditions,
  parseDeities,
  parseFeats,
  parseItems,
  parseLanguages,
  parseMagicVariants,
  parseOptionalFeatures,
  parseRaces,
  parseSenses,
  parseSkills,
  parseSpells,
  parseVariantRules,
} from './parsers';

export interface DataLoaderOptions {
  onProgress?: (current: number, total: number, resource: string) => void;
  signal?: AbortSignal;
}

export class FiveEToolsDataLoader {
  private baseUrl: string;
  private isRemote: boolean;

  constructor(config: DataSourceConfig) {
    this.baseUrl = config.path;
    this.isRemote = config.type === 'remote';
  }

  async loadAllData(options?: DataLoaderOptions): Promise<GameData> {
    const resources = [
      { key: 'books', file: 'books.json' },
      { key: 'adventures', file: 'adventures.json' },
      { key: 'races', file: 'races.json' },
      { key: 'classIndex', file: 'class/index.json' },
      { key: 'backgrounds', file: 'backgrounds.json' },
      { key: 'spellIndex', file: 'spells/index.json' },
      { key: 'feats', file: 'feats.json' },
      { key: 'items', file: 'items.json' },
      { key: 'itemsBase', file: 'items-base.json' },
      { key: 'actions', file: 'actions.json' },
      { key: 'conditions', file: 'conditionsdiseases.json' },
      { key: 'deities', file: 'deities.json' },
      { key: 'skills', file: 'skills.json' },
      { key: 'senses', file: 'senses.json' },
      { key: 'languages', file: 'languages.json' },
      { key: 'magicvariants', file: 'magicvariants.json' },
      { key: 'optionalfeatures', file: 'optionalfeatures.json' },
      { key: 'variantrules', file: 'variantrules.json' },
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
    let booksData: unknown = null;
    let adventuresData: unknown = null;
    let classIndexData: unknown = null;
    let spellIndexData: unknown = null;

    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];

      if (options?.onProgress) {
        options.onProgress(i, resources.length, resource.file);
      }

      if (options?.signal?.aborted) {
        throw new Error('Data loading aborted');
      }

      try {
        const data = await this.loadResource(resource.file, options?.signal);

        switch (resource.key) {
          case 'books':
            booksData = data;
            break;
          case 'adventures':
            adventuresData = data;
            break;
          case 'classIndex':
            classIndexData = data;
            break;
          case 'spellIndex':
            spellIndexData = data;
            break;
          case 'races':
            gameData.races = parseRaces(data) as GameData['races'];
            gameData.races.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'backgrounds':
            gameData.backgrounds = parseBackgrounds(
              data,
            ) as GameData['backgrounds'];
            gameData.backgrounds.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'feats':
            gameData.feats = parseFeats(data) as GameData['feats'];
            gameData.feats.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'items':
            gameData.items = parseItems(data) as GameData['items'];
            gameData.items.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'itemsBase':
            gameData.itemsBase = parseItems(data) as GameData['itemsBase'];
            gameData.itemsBase.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'actions':
            gameData.actions = parseActions(data);
            gameData.actions.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'conditions':
            gameData.conditions = parseConditions(data);
            gameData.conditions.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'deities':
            gameData.deities = parseDeities(data);
            gameData.deities.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'skills':
            gameData.skills = parseSkills(data);
            gameData.skills.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'senses':
            gameData.senses = parseSenses(data);
            gameData.senses.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'languages':
            gameData.languages = parseLanguages(data);
            gameData.languages.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'magicvariants':
            gameData.magicvariants = parseMagicVariants(data);
            gameData.magicvariants.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'optionalfeatures':
            gameData.optionalfeatures = parseOptionalFeatures(data);
            gameData.optionalfeatures.forEach((item) => {
              this.addItemSource(item, sourcesSet);
            });
            break;
          case 'variantrules':
            gameData.variantrules = parseVariantRules(data);
            gameData.variantrules.forEach((item) => {
              this.addItemSource(item, sourcesSet);
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

    gameData.sources = buildSourcesList(
      Array.from(sourcesSet),
      booksData,
      adventuresData,
    );

    if (options?.onProgress) {
      options.onProgress(resources.length, resources.length, 'Complete');
    }

    return gameData;
  }

  private async loadClassData(
    indexData: unknown,
    gameData: GameData,
    sourcesSet: Set<string>,
    options?: DataLoaderOptions,
  ): Promise<void> {
    const classFiles = this.extractClassFiles(indexData);

    const allClasses: GameData['classes'] = [];
    const allClassFeatures: GameData['classFeatures'] = [];

    for (const classFile of classFiles) {
      try {
        const classData = await this.loadResource(
          `class/${classFile}`,
          options?.signal,
        );

        const parsedClasses = parseClasses(classData);
        allClasses.push(...parsedClasses);
        parsedClasses.forEach((item) => {
          this.addItemSource(item, sourcesSet);
        });

        const parsedFeatures = parseClassFeatures(classData);
        allClassFeatures.push(...parsedFeatures);
        parsedFeatures.forEach((item) => {
          this.addItemSource(item, sourcesSet);
        });
      } catch (error) {
        console.warn(`Failed to load class file ${classFile}:`, error);
      }
    }

    gameData.classes = allClasses;
    gameData.classFeatures = allClassFeatures;
  }

  private async loadSpellData(
    indexData: unknown,
    gameData: GameData,
    sourcesSet: Set<string>,
    options?: DataLoaderOptions,
  ): Promise<void> {
    const spellFiles = this.extractSpellFiles(indexData);

    const allSpells: GameData['spells'] = [];

    for (const spellFile of spellFiles) {
      try {
        const spellData = await this.loadResource(
          `spells/${spellFile}`,
          options?.signal,
        );

        const parsedSpells = parseSpells(spellData);
        allSpells.push(...parsedSpells);
        parsedSpells.forEach((item) => {
          this.addItemSource(item, sourcesSet);
        });
      } catch (error) {
        console.warn(`Failed to load spell file ${spellFile}:`, error);
      }
    }

    gameData.spells = allSpells;
  }

  private extractClassFiles(indexData: unknown): string[] {
    const files: string[] = [];

    if (Array.isArray(indexData)) {
      indexData.forEach((item) => {
        if (typeof item === 'string') {
          files.push(item);
        }
      });
    } else if (typeof indexData === 'object' && indexData !== null) {
      Object.values(indexData).forEach((value) => {
        if (typeof value === 'string') {
          files.push(value);
        } else if (Array.isArray(value)) {
          value.forEach((item) => {
            if (typeof item === 'string') {
              files.push(item);
            }
          });
        }
      });
    }

    return files;
  }

  private extractSpellFiles(indexData: unknown): string[] {
    const files: string[] = [];

    if (Array.isArray(indexData)) {
      indexData.forEach((item) => {
        if (typeof item === 'string') {
          files.push(item);
        }
      });
    } else if (typeof indexData === 'object' && indexData !== null) {
      Object.values(indexData).forEach((value) => {
        if (typeof value === 'string') {
          files.push(value);
        } else if (Array.isArray(value)) {
          value.forEach((item) => {
            if (typeof item === 'string') {
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
  ): Promise<unknown> {
    if (!this.isRemote) {
      const sep = this.baseUrl.includes('\\') ? '\\' : '/';
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
        filename.startsWith('class/') ||
        filename.startsWith('books/') ||
        filename.startsWith('spells/')
      ) {
        return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}data/${filename}`;
      }
      return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}data/${filename}`;
    }
    return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}${filename}`;
  }

  private addItemSource(item: unknown, sourcesSet: Set<string>) {
    if (typeof item !== 'object' || item === null) return;
    const source = (item as { source?: unknown }).source;
    if (typeof source === 'string' && source.length > 0) {
      sourcesSet.add(source);
    }
  }
}

export async function loadDataFromSource(
  config: DataSourceConfig,
  options?: DataLoaderOptions,
): Promise<GameData> {
  const loader = new FiveEToolsDataLoader(config);
  return await loader.loadAllData(options);
}
