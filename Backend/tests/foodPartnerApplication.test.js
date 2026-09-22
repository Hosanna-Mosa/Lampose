/* ══════════════════════════════════════════════════════════════════════════
   An application without an owner email, and one with a menu typed at the
   counter.

   Two changes the Onboard console asked for, and both of them are the kind
   that look fine in a form and fail on the SECOND restaurant:

   ## The email

   `ownerEmail` was required and uniquely indexed. Making it optional is not
   one line — an absent field indexes as `null`, and a plain unique index
   accepts exactly one of those. The schema is now `sparse`, the sanitiser
   omits the key rather than writing `''` (an empty string is a value, and a
   sparse index does not skip it), and `submitApplication` only asks the
   duplicate check about an email when there is one. Any of those three
   missing and the first email-less restaurant saves while every one after it
   is refused as a duplicate of it.

   These tests run against a real `mongod` with the real indexes built, because
   that is the only place the sparse-ness is actually enforced — a unit test of
   the schema object would pass with the old index still in the database. The
   deployment half is `npm run fix:owner-email-index`.

   ## The menu

   Step 2 of the console now collects dishes. They arrive as `products` and
   have to survive `sanitiseApplication` with their three required fields
   intact, and an application carrying none of them still has to be valid.
   ══════════════════════════════════════════════════════════════════════════ */
const test = require('node:test');
const assert = require('node:assert/strict');

const { withDatabase } = require('./helpers/db');
const { sanitiseApplication, validateApplication } = require('../src/modules/foodpartners/foodPartner.util');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

withDatabase();

/** The shape the Onboard console posts, minus whatever a case is testing. */
const application = (over = {}) => ({
  partnerType: 'food',
  restaurantName: 'Paradise Biryani',
  cuisines: ['North Indian'],
  ownerName: 'Ravi Kumar',
  ownerPhone: '9848012345',
  sameAsOwner: true,
  address: { area: 'Danavaipeta', city: 'Rajahmundry' },
  /* The papers the form asks for on step 3. Present here because this file is
     about the email and the menu — an application missing a licence is refused
     for the licence, and every assertion below would be testing that instead. */
  fssaiNumber: '12345678901234',
  fssaiExpiry: '2030-01-01',
  panNumber: 'ABCDE1234F',
  selectedDays: ['Monday'],
  dayTimeSlots: { Monday: [{ open: '09:00', close: '22:00' }] },
  contract: { accepted: true, signature: 'Ravi Kumar' },
  ...over,
});

/* A document as `submitApplication` writes one: the sanitised fields and a
   fresh id, and nothing else. */
const saveRestaurant = async (body, restaurantId) => {
  const { restaurant } = sanitiseApplication(body);
  return FoodRestaurant.create({ ...restaurant, restaurantId });
};

test.describe('an application with no owner email', () => {
  test.beforeEach(async () => {
    /* The indexes the schema declares, built for real. `deleteMany` between
       tests leaves them in place, so this is cheap after the first call. */
    await FoodRestaurant.syncIndexes();
  });

  test('the sanitiser omits the field rather than storing an empty string', () => {
    const { restaurant } = sanitiseApplication(application());
    assert.equal('ownerEmail' in restaurant, false, 'the key must not be written at all');
  });

  test('it still keeps an email that was given, lowercased', () => {
    const { restaurant } = sanitiseApplication(application({ ownerEmail: '  Owner@Business.COM ' }));
    assert.equal(restaurant.ownerEmail, 'owner@business.com');
  });

  test('validateApplication accepts one with no email', () => {
    const problems = validateApplication(sanitiseApplication(application()));
    assert.deepEqual(problems, [], `expected no problems, got: ${problems.join(', ')}`);
  });

  test('and still refuses one that is not an email address', () => {
    const problems = validateApplication(sanitiseApplication(application({ ownerEmail: 'not-an-address' })));
    assert.ok(
      problems.some((problem) => problem.includes('email')),
      `expected an email problem, got: ${problems.join(', ') || 'none'}`,
    );
  });

  test('TWO restaurants may have none — the index is sparse', async () => {
    await saveRestaurant(application({ ownerPhone: '9848012345' }), 'FP-TEST0001');

    /* The one that used to fail: E11000 on ownerEmail_1, dup key null, for a
       field neither owner filled in. */
    await saveRestaurant(application({ ownerPhone: '9848012346' }), 'FP-TEST0002');

    assert.equal(await FoodRestaurant.countDocuments({}), 2);
  });

  test('but one email is still one restaurant', async () => {
    await saveRestaurant(application({ ownerEmail: 'ravi@paradise.com' }), 'FP-TEST0003');

    await assert.rejects(
      saveRestaurant(
        application({ ownerEmail: 'ravi@paradise.com', ownerPhone: '9848012347' }),
        'FP-TEST0004',
      ),
      (error) => error.code === 11000,
      'a second restaurant on the same email must still collide',
    );
  });
});

test.describe('the credential an application is written with', () => {
  /* The client's original report: "all the details are saving but not the
     password". They were not — an application from the Onboard console carries
     none, because nobody in that room should be choosing the owner's, and the
     document was written with no hash at all. It gets one now; nobody is told
     it, and `foodAdmin.controller.js` mints the one the owner actually uses at
     approval. */
  test('one is generated when the body carries no password', () => {
    const { password } = sanitiseApplication(application());
    assert.equal(password, '', 'nothing was sent');
    /* The controller is what hashes it — asserted end to end in
       `restaurantCredentials.test.js`, which starts from a saved document. */
  });

  test('a password that WAS sent is the one kept', () => {
    const { password } = sanitiseApplication(application({ password: 'chosen-by-the-owner' }));
    assert.equal(password, 'chosen-by-the-owner');
  });

  test('and a short one is still refused', () => {
    const problems = validateApplication(sanitiseApplication(application({ password: 'abc' })));
    assert.ok(
      problems.some((problem) => problem.includes('password')),
      `expected a password problem, got: ${problems.join(', ') || 'none'}`,
    );
  });
});

test.describe("the restaurant's own picture", () => {
  test('an application with no logo is valid, and carries no empty image', () => {
    const sanitised = sanitiseApplication(application());
    assert.equal('logoImage' in sanitised.restaurant, false);
    assert.deepEqual(validateApplication(sanitised), []);
  });

  test('a logo uploaded at submit is kept as url and publicId', () => {
    const { restaurant } = sanitiseApplication(application({
      logoImage: { url: 'https://res.cloudinary.com/x/logo.jpg', publicId: 'x/logo' },
    }));

    assert.equal(restaurant.logoImage.url, 'https://res.cloudinary.com/x/logo.jpg');
    assert.equal(restaurant.logoImage.publicId, 'x/logo');
  });
});

test.describe('the menu the Onboard console now collects', () => {
  /* Exactly what `buildApplication.js` sends for one typed dish. */
  const dish = (over = {}) => ({
    productName: 'Chicken Biryani',
    category: 'Biryani',
    price: 240,
    discountedPrice: null,
    isVeg: 'non-veg',
    description: 'Served with raita',
    displayOrder: 0,
    ...over,
  });

  test('an application with no dishes at all is valid', () => {
    const sanitised = sanitiseApplication(application({ products: [] }));
    assert.equal(sanitised.products.length, 0);
    assert.deepEqual(validateApplication(sanitised), []);
  });

  test('a typed dish survives with its three required fields', () => {
    const { products } = sanitiseApplication(application({ products: [dish()] }));

    assert.equal(products.length, 1);
    assert.equal(products[0].productName, 'Chicken Biryani');
    assert.equal(products[0].category, 'Biryani');
    assert.equal(products[0].price, 240);
    assert.equal(products[0].isVeg, 'non-veg');
    /* An untouched offer box is null, not zero — zero is a dish given away. */
    assert.equal(products[0].discountedPrice, null);
  });

  test('a real offer is kept', () => {
    const { products } = sanitiseApplication(application({ products: [dish({ discountedPrice: 199 })] }));
    assert.equal(products[0].discountedPrice, 199);
  });

  test('the order they were typed in is the order they are stored in', () => {
    const { products } = sanitiseApplication(application({
      products: [dish({ displayOrder: 0 }), dish({ productName: 'Raita', displayOrder: 1 })],
    }));
    assert.deepEqual(products.map((p) => p.displayOrder), [0, 1]);
  });

  test('a dish photograph arrives as productImage', () => {
    /* What the submit call attaches after Cloudinary answers — `photoFile` is
       stripped from the body there, so what the server ever sees is this. */
    const { products } = sanitiseApplication(application({
      products: [dish({ productImage: { url: 'https://res.cloudinary.com/x/dish.jpg', publicId: 'x/dish' } })],
    }));

    assert.equal(products[0].productImage.url, 'https://res.cloudinary.com/x/dish.jpg');
    assert.equal(products[0].productImage.publicId, 'x/dish');
  });

  test('and a dish with no price is refused, by name', () => {
    const sanitised = sanitiseApplication(application({ products: [dish({ price: '' })] }));
    const problems = validateApplication(sanitised);
    assert.ok(
      problems.some((problem) => problem.includes('Chicken Biryani')),
      `expected the dish to be named, got: ${problems.join(', ') || 'none'}`,
    );
  });
});
