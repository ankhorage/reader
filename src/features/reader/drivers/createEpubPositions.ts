import { Locator, LocatorLocations, type Publication } from '@readium/shared';

/*** Build the complete position list Readium requires when an EPUB has no position-list resource. */
export function createEpubPositions(publication: Publication): Locator[] {
  const total = publication.readingOrder.items.length;
  return publication.readingOrder.items.map(
    (link, index) =>
      new Locator({
        href: link.href,
        type: link.type ?? 'application/xhtml+xml',
        ...(link.title === undefined ? {} : { title: link.title }),
        locations: new LocatorLocations({
          position: index + 1,
          progression: 0,
          totalProgression: index / total,
        }),
      }),
  );
}
