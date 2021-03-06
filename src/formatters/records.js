import { formatOneBase } from '../helpers/formatters';


export function resourceUrl(rootUrl, record) {
    if (!record.recordId) throw new Error('recordId not found in record object');
    return rootUrl + '/records/' + record.recordId.substring(0, 12);
}

export const linkMapping = {
    '@relatedResources': { basePath: '/related-resources', sub: true },
    '@catalogs': { basePath: '/services', array: true, id: 'catalogs' }
};

export const omitKeys = ['_id', '__v'];



export function formatOne(resource) {
    return formatOneBase(resource, { resourceUrl, linkMapping, omitKeys });
}

export function formatMany(resources) {
    return resources.map(resource => formatOne(resource));
}
