interface LocationApiOptions {
    selectElement: HTMLSelectElement
    flagElement: HTMLElement
    locationsUrl: string
    flagsBaseUrl: string
    mostFrequentKeys?: string[]
    regionOrder?: readonly string[]
    regionLabels?: Readonly<Record<string, string>>
    placeholderLabel?: string
    emptyFlagLabel?: string
}

interface LocationApiLocation {
    localName: string
    flag: string
}

interface LocationApiFlagRenderResult {
    locationKey: string
    label: string
    flagCode: string
    flagUrl: string
}

type RegionDataset = Record<string, Record<string, LocationDatasetEntry>>

interface LocationDatasetEntry {
    local_name: string
    emoji: string
}

const DEFAULT_REGION_ORDER = [
    'africa',
    'america',
    'asia',
    'europe',
    'oceania'
] as const

const DEFAULT_REGION_LABELS: Readonly<Record<string, string>> = {
    africa: 'Africa',
    america: 'America',
    asia: 'Asia',
    europe: 'Europe',
    oceania: 'Oceania'
}

const DEFAULT_MOST_FREQUENT_KEYS = [
    'scotland',
    'england',
    'wales',
    'northern ireland',
    'united states of america',
    'japan',
    'spain',
    'argentina'
] as const

export class locApi {
    private readonly selectElement: HTMLSelectElement
    private readonly flagElement: HTMLElement
    private readonly locationsUrl: string
    private readonly flagsBaseUrl: string
    private readonly mostFrequentKeys: readonly string[]
    private readonly regionOrder: readonly string[]
    private readonly regionLabels: Readonly<Record<string, string>>
    private readonly placeholderLabel: string
    private readonly emptyFlagLabel: string

    private dataset: RegionDataset | null = null
    private changeHandler: (() => void) | null = null

    public constructor(options: LocationApiOptions) {
        this.selectElement = options.selectElement
        this.flagElement = options.flagElement
        this.locationsUrl = options.locationsUrl
        this.flagsBaseUrl = trimTrailingSlash(options.flagsBaseUrl)
        this.mostFrequentKeys = options.mostFrequentKeys ?? DEFAULT_MOST_FREQUENT_KEYS
        this.regionOrder = options.regionOrder ?? DEFAULT_REGION_ORDER
        this.regionLabels = options.regionLabels ?? DEFAULT_REGION_LABELS
        this.placeholderLabel = options.placeholderLabel ?? 'Select a location'
        this.emptyFlagLabel = options.emptyFlagLabel ?? 'Select a location'
    }

    /**
     * Loads the dataset, fills the dropdown, and binds the change listener.
     *
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        this.dataset = await this.fetchLocations()
        this.populateDropdown()
        this.bindEvents()

        if (!this.selectElement.value) {
            this.clearFlag()
            return
        }

        await this.renderSelectedFlag(this.selectElement.value)
    }

    /**
     * Removes listeners and clears internal state.
     *
     * @returns {void}
     */
    public destroy(): void {
        if (this.changeHandler) {
            this.selectElement.removeEventListener('change', this.changeHandler)
            this.changeHandler = null
        }

        this.dataset = null
    }

    /**
     * Reloads the remote locations dataset and redraws the dropdown.
     *
     * @returns {Promise<void>}
     */
    public async reload(): Promise<void> {
        const selectedLocationKey = this.selectElement.value

        this.dataset = await this.fetchLocations()
        this.populateDropdown()

        if (!selectedLocationKey) {
            this.clearFlag()
            return
        }

        const location = this.findLocation(selectedLocationKey)

        if (!location) {
            this.clearFlag()
            return
        }

        this.selectElement.value = selectedLocationKey
        await this.renderSelectedFlag(selectedLocationKey)
    }

    /**
     * Programmatically selects a location and renders its flag.
     *
     * @param {string} locationKey
     * @returns {Promise<void>}
     */
    public async setValue(locationKey: string): Promise<void> {
        this.ensureInitialised()

        if (!locationKey) {
            this.selectElement.value = ''
            this.clearFlag()
            return
        }

        const location = this.findLocation(locationKey)

        if (!location) {
            throw new Error(`Location not found in dataset: ${locationKey}`)
        }

        this.selectElement.value = locationKey
        await this.renderSelectedFlag(locationKey)
    }

    /**
     * Returns the currently selected location key.
     *
     * @returns {string}
     */
    public getValue(): string {
        return this.selectElement.value
    }

    /**
     * Returns a location from the loaded dataset.
     *
     * @param {string} locationKey
     * @returns {LocationApiLocation | null}
     */
    public getLocation(locationKey: string): LocationApiLocation | null {
        this.ensureInitialised()

        const location = this.findLocation(locationKey)

        if (!location) {
            return null
        }

        return {
            localName: location.local_name,
            flag: location.emoji
        }
    }

    /**
     * Clears the rendered flag host.
     *
     * @returns {void}
     */
    public clearFlag(): void {
        this.flagElement.replaceChildren()
        this.flagElement.textContent = this.emptyFlagLabel
    }

    /**
     * Renders the flag for the currently selected value.
     *
     * @returns {Promise<LocationApiFlagRenderResult | null>}
     */
    public async renderCurrentFlag(): Promise<LocationApiFlagRenderResult | null> {
        const locationKey = this.selectElement.value

        if (!locationKey) {
            this.clearFlag()
            return null
        }

        return this.renderSelectedFlag(locationKey)
    }

    /**
     * Returns the resolved URL for a location's flag asset.
     *
     * @param {string} locationKey
     * @returns {string}
     */
    public getFlagUrl(locationKey: string): string {
        this.ensureInitialised()

        const location = this.findLocation(locationKey)

        if (!location) {
            throw new Error(`Location not found in dataset: ${locationKey}`)
        }

        const flagCode = flagToCountryCode(location.emoji)

        return `${this.flagsBaseUrl}/${flagCode}.png`
    }

    /**
     * Builds the user-facing label for a location.
     *
     * @param {string} locationKey
     * @returns {string}
     */
    public getLabel(locationKey: string): string {
        this.ensureInitialised()

        const location = this.findLocation(locationKey)

        if (!location) {
            throw new Error(`Location not found in dataset: ${locationKey}`)
        }

        return buildLocationLabel(locationKey, location.local_name)
    }

    private bindEvents(): void {
        if (this.changeHandler) {
            this.selectElement.removeEventListener('change', this.changeHandler)
        }

        this.changeHandler = () => {
            void this.renderCurrentFlag()
        }

        this.selectElement.addEventListener('change', this.changeHandler)
    }

    private async fetchLocations(): Promise<RegionDataset> {
        const response = await fetch(this.locationsUrl)

        if (!response.ok) {
            throw new Error(`Failed to fetch ${this.locationsUrl} (${response.status})`)
        }

        const value: unknown = await response.json()

        if (!isRecord(value)) {
            throw new Error('Locations JSON must contain an object at the root')
        }

        return normaliseRegionDataset(value)
    }

    private populateDropdown(): void {
        this.ensureInitialised()

        this.selectElement.replaceChildren()
        this.appendPlaceholderOption()
        this.appendMostFrequentGroup()
        this.appendRegionGroups()
    }

    private appendPlaceholderOption(): void {
        const placeholder = document.createElement('option')
        placeholder.value = ''
        placeholder.textContent = this.placeholderLabel
        this.selectElement.appendChild(placeholder)
    }

    private appendMostFrequentGroup(): void {
        const entries = this.mostFrequentKeys
            .map((locationKey) => {
                const location = this.findLocation(locationKey)

                if (!location) {
                    return null
                }

                return {
                    locationKey,
                    location
                }
            })
            .filter(notNull)

        if (entries.length === 0) {
            return
        }

        const group = document.createElement('optgroup')
        group.label = 'Most Frequent'

        for (const item of entries) {
            const option = document.createElement('option')
            option.value = item.locationKey
            option.textContent = buildLocationLabel(item.locationKey, item.location.local_name)
            group.appendChild(option)
        }

        this.selectElement.appendChild(group)
    }

    private appendRegionGroups(): void {
        if (!this.dataset) {
            return
        }

        for (const regionName of this.regionOrder) {
            const regionEntries = this.dataset[regionName]

            if (!isRecord(regionEntries)) {
                continue
            }

            const sortedEntries = Object.entries(regionEntries)
                .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, 'en'))

            if (sortedEntries.length === 0) {
                continue
            }

            const group = document.createElement('optgroup')
            group.label = this.regionLabels[regionName] ?? regionName

            for (const [locationKey, location] of sortedEntries) {
                const option = document.createElement('option')
                option.value = locationKey
                option.textContent = buildLocationLabel(locationKey, location.local_name)
                group.appendChild(option)
            }

            this.selectElement.appendChild(group)
        }
    }

    private findLocation(locationKey: string): LocationDatasetEntry | null {
        if (!this.dataset) {
            return null
        }

        for (const regionName of this.regionOrder) {
            const regionEntries = this.dataset[regionName]

            if (!isRecord(regionEntries)) {
                continue
            }

            const location = regionEntries[locationKey]

            if (isLocationDatasetEntry(location)) {
                return location
            }
        }

        return null
    }

    private async renderSelectedFlag(locationKey: string): Promise<LocationApiFlagRenderResult> {
        const location = this.findLocation(locationKey)

        if (!location) {
            throw new Error(`Location not found in dataset: ${locationKey}`)
        }

        const flagCode = flagToCountryCode(location.emoji)
        const flagUrl = `${this.flagsBaseUrl}/${flagCode}.png`

        await assertAssetExists(flagUrl)

        const image = document.createElement('img')
        image.src = flagUrl
        image.alt = `${buildLocationLabel(locationKey, location.local_name)} flag`

        this.flagElement.replaceChildren(image)

        return {
            locationKey,
            label: buildLocationLabel(locationKey, location.local_name),
            flagCode,
            flagUrl
        }
    }

    private ensureInitialised(): void {
        if (this.dataset) {
            return
        }

        throw new Error('LocationApi has not been initialised. Call init() first.')
    }
}

/**
 * Creates and returns a LocationApi instance.
 *
 * @param {LocationApiOptions} options
 * @returns {locApi}
 */
export function createLocationApi(options: LocationApiOptions): locApi {
    return new locApi(options)
}

/**
 * Verifies that a remote asset exists.
 *
 * @param {string} assetUrl
 * @returns {Promise<void>}
 */
async function assertAssetExists(assetUrl: string): Promise<void> {
    const response = await fetch(assetUrl)

    if (response.ok) {
        return
    }

    throw new Error(`Failed to fetch ${assetUrl} (${response.status})`)
}

/**
 * Converts a region dataset value into a strongly typed dataset.
 *
 * @param {unknown} value
 * @returns {RegionDataset}
 */
function normaliseRegionDataset(value: unknown): RegionDataset {
    if (!isRecord(value)) {
        throw new Error('Locations JSON must contain an object at the root')
    }

    const dataset: RegionDataset = {}

    for (const [regionName, regionValue] of Object.entries(value)) {
        if (!isRecord(regionValue)) {
            continue
        }

        const regionEntries: Record<string, LocationDatasetEntry> = {}

        for (const [locationKey, locationValue] of Object.entries(regionValue)) {
            if (!isLocationDatasetEntry(locationValue)) {
                continue
            }

            regionEntries[locationKey] = locationValue
        }

        dataset[regionName] = regionEntries
    }

    return dataset
}

/**
 * Builds the display label for a location entry.
 *
 * @param {string} locationKey
 * @param {string} localName
 * @returns {string}
 */
function buildLocationLabel(locationKey: string, localName: string): string {
    const englishName = formatEnglishName(locationKey)

    return namesMatch(englishName, localName)
        ? englishName
        : `${englishName} (${localName})`
}

/**
 * Checks whether two location names are effectively the same.
 *
 * @param {string} englishName
 * @param {string} localName
 * @returns {boolean}
 */
function namesMatch(englishName: string, localName: string): boolean {
    return normaliseName(englishName) === normaliseName(localName)
}

/**
 * Normalises a location name for comparison.
 *
 * @param {string} value
 * @returns {string}
 */
function normaliseName(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase('en')
}

/**
 * Formats a dataset key into a title-cased English label.
 *
 * @param {string} value
 * @returns {string}
 */
function formatEnglishName(value: string): string {
    return value
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

/**
 * Converts a flag string into a lowercase ISO-style country code.
 *
 * @param {string} flag
 * @returns {string}
 */
function flagToCountryCode(flag: string): string {
    const symbols = Array.from(flag)

    if (symbols.length === 0) {
        throw new Error('Flag value is empty')
    }

    return symbols
        .map((symbol) => regionalIndicatorToAscii(symbol))
        .join('')
        .toLowerCase()
}

/**
 * Converts a regional indicator symbol into its ASCII letter.
 *
 * @param {string} symbol
 * @returns {string}
 */
function regionalIndicatorToAscii(symbol: string): string {
    const codePoint = symbol.codePointAt(0)

    if (!codePoint) {
        throw new Error(`Invalid regional indicator symbol: ${symbol}`)
    }

    const asciiCode = codePoint - 127397

    if (asciiCode < 65 || asciiCode > 90) {
        throw new Error(`Symbol is not a regional indicator letter: ${symbol}`)
    }

    return String.fromCharCode(asciiCode)
}

/**
 * Removes a trailing slash from a URL-like string.
 *
 * @param {string} value
 * @returns {string}
 */
function trimTrailingSlash(value: string): string {
    return value.endsWith('/')
        ? value.slice(0, -1)
        : value
}

/**
 * Checks whether a value is a plain object record.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Checks whether a value is a valid location dataset entry.
 *
 * @param {unknown} value
 * @returns {value is LocationDatasetEntry}
 */
function isLocationDatasetEntry(value: unknown): value is LocationDatasetEntry {
    return isRecord(value)
        && typeof value.emoji === 'string'
        && typeof value.local_name === 'string'
}

/**
 * Narrows out null values from arrays.
 *
 * @param {T | null} value
 * @returns {value is T}
 */
function notNull<T>(value: T | null): value is T {
    return value !== null
}