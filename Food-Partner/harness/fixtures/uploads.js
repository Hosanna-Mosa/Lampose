/* Stands in for services/uploads.ts. `isUploaded` is a pure predicate the forms
   render against, so it stays real. */
const actual = jest.requireActual('@/services/uploads');
module.exports = {
  isUploaded: actual.isUploaded,
  uploadOne: jest.fn(async (kind, file) => file),
  uploadMany: jest.fn(async (kind, files) => files),
  uploadApplicationImages: jest.fn(async (data) => data),
};
