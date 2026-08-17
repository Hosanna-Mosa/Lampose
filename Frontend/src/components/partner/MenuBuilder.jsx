import { useState } from 'react';
import Icon from '../Icon';
import { Field, Modal, Note } from './OnboardingFields';
import { uid } from '../../lib/uid';

/* ══════════════════════════════════════════════════════════════════════════
   The menu, built by hand.

   Categories hold items; an item is a name, a price and the two flags that
   decide how it is shown in the app — veg or not, and whether it leads the
   listing. A meat centre uses the same structure for its counter, which is
   why the only thing `partnerType` changes here is wording.
   ══════════════════════════════════════════════════════════════════════════ */

function ItemForm({ item, isMeat, onSave, onCancel }) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price || '');
  const [description, setDescription] = useState(item?.description || '');
  const [isVeg, setIsVeg] = useState(item?.isVeg ?? !isMeat);
  const [isBestseller, setIsBestseller] = useState(item?.isBestseller || false);
  const [photo, setPhoto] = useState(item?.photo || null);

  const ready = name.trim() && price;

  const save = () => {
    if (!ready) return;
    onSave({
      id: item?.id || uid(),
      name: name.trim(),
      price,
      description: description.trim(),
      isVeg,
      isBestseller,
      photo,
    });
  };

  return (
    <>
      <div className="ob-grid ob-grid--2">
        <Field label={isMeat ? 'Product name' : 'Item name'} required htmlFor="ob-item-name">
          <input
            id="ob-item-name" type="text" className="ob-input" value={name}
            onChange={e => setName(e.target.value)}
            placeholder={isMeat ? 'e.g. Chicken curry cut, 500g' : 'e.g. Butter chicken'}
          />
        </Field>
        <Field label="Price (₹)" required htmlFor="ob-item-price">
          <input
            id="ob-item-price" type="text" inputMode="numeric" className="ob-input" value={price}
            onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 349"
          />
        </Field>
      </div>

      <Field label="Description" optional htmlFor="ob-item-desc">
        <textarea
          id="ob-item-desc" rows="2" className="ob-input" value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={isMeat
            ? 'e.g. Cleaned, cut and packed fresh each morning'
            : 'e.g. Creamy tomato gravy, cooked overnight'}
        />
      </Field>

      <div className="ob-row">
        {!isMeat && (
          <Field label="Type">
            <div className="ob-seg">
              <button
                type="button" onClick={() => setIsVeg(true)}
                className={`ob-seg__btn ob-seg__btn--veg${isVeg ? ' is-on' : ''}`}
              >
                <span className="ob-diet ob-diet--veg" />
                Veg
              </button>
              <button
                type="button" onClick={() => setIsVeg(false)}
                className={`ob-seg__btn ob-seg__btn--nonveg${!isVeg ? ' is-on' : ''}`}
              >
                <span className="ob-diet ob-diet--nonveg" />
                Non-veg
              </button>
            </div>
          </Field>
        )}

        <Field label="Tags">
          <button
            type="button" onClick={() => setIsBestseller(v => !v)}
            className={`ob-seg__btn ob-seg__btn--star${isBestseller ? ' is-on' : ''}`}
          >
            <Icon name="flame" className="ob-ico" />
            {isMeat ? 'Featured' : 'Bestseller'}
          </button>
        </Field>
      </div>

      <Field label={isMeat ? 'Product photo' : 'Item photo'} optional>
        {photo ? (
          <div className="ob-photo">
            <Icon name="image" className="ob-ico" />
            <span>{photo.name}</span>
            <button type="button" className="ob-x" onClick={() => setPhoto(null)} aria-label="Remove photo">
              <Icon name="close" className="ob-ico" />
            </button>
          </div>
        ) : (
          <div className="ob-row ob-row--tight">
            <label className="ob-ghost">
              <Icon name="image" className="ob-ico" />
              Upload a photo
              <input
                type="file" accept="image/*" className="ob-file"
                onChange={e => setPhoto(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button" className="ob-ghost"
              onClick={() => setPhoto(new File(['sample photo'], 'item_photo_sample.png', { type: 'image/png' }))}
            >
              <Icon name="sparkle" className="ob-ico" />
              Use a sample
            </button>
          </div>
        )}
      </Field>

      <div className="ob-modal__foot">
        <button type="button" className="ob-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="ob-go" onClick={save} disabled={!ready}>
          {item ? 'Update item' : isMeat ? 'Add product' : 'Add to menu'}
        </button>
      </div>
    </>
  );
}

export default function MenuBuilder({ categories, onChange, isMeat, help, emptyTitle, emptyHelp }) {
  const [editing, setEditing] = useState(null);      // { categoryId, item? }
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  const itemCount = categories.reduce((sum, c) => sum + c.items.length, 0);

  const addCategory = () => {
    const name = newName.trim();
    if (!name) return;
    onChange([...categories, { id: uid(), name, items: [] }]);
    setNewName('');
    setNaming(false);
  };

  const saveItem = item => {
    onChange(categories.map(category => {
      if (category.id !== editing.categoryId) return category;
      return {
        ...category,
        items: editing.item
          ? category.items.map(existing => (existing.id === item.id ? item : existing))
          : [...category.items, item],
      };
    }));
    setEditing(null);
  };

  const removeItem = (categoryId, itemId) => onChange(categories.map(category => (
    category.id === categoryId
      ? { ...category, items: category.items.filter(item => item.id !== itemId) }
      : category
  )));

  return (
    <>
      <div className="ob-card">
        <div className="ob-card__head">
          <div>
            <p className="ob-label">{isMeat ? 'Product categories & items' : 'Menu categories & items'}</p>
            <p className="ob-hint">{help}</p>
          </div>
          {itemCount > 0 && (
            <span className="ob-count">{itemCount} item{itemCount === 1 ? '' : 's'}</span>
          )}
        </div>

        {categories.length === 0 ? (
          <div className="ob-empty">
            <Icon name="menu" className="ob-ico ob-ico--xl" />
            <strong>{emptyTitle}</strong>
            <p>{emptyHelp}</p>
          </div>
        ) : (
          <div className="ob-cats">
            {categories.map(category => (
              <div className="ob-cat" key={category.id}>
                <div className="ob-cat__head">
                  <div>
                    <p className="ob-cat__name">{category.name}</p>
                    <p className="ob-hint">
                      {category.items.length} item{category.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="ob-cat__acts">
                    <button
                      type="button" className="ob-link"
                      onClick={() => setEditing({ categoryId: category.id })}
                    >
                      <Icon name="plus" className="ob-ico" />
                      Add item
                    </button>
                    <button
                      type="button" className="ob-x"
                      onClick={() => onChange(categories.filter(c => c.id !== category.id))}
                      aria-label={`Remove ${category.name}`}
                    >
                      <Icon name="trash" className="ob-ico" />
                    </button>
                  </div>
                </div>

                {category.items.length === 0 ? (
                  <p className="ob-cat__empty">Nothing in here yet — add the first item.</p>
                ) : (
                  <ul className="ob-items">
                    {category.items.map(item => (
                      <li className="ob-item" key={item.id}>
                        <span className={`ob-diet ob-diet--${item.isVeg ? 'veg' : 'nonveg'}`} />
                        <div className="ob-item__body">
                          <p className="ob-item__name">
                            {item.name}
                            {item.isBestseller && <span className="ob-star">Bestseller</span>}
                          </p>
                          {item.description && <p className="ob-hint">{item.description}</p>}
                        </div>
                        <span className="ob-item__price">₹{item.price}</span>
                        <button
                          type="button" className="ob-x"
                          onClick={() => setEditing({ categoryId: category.id, item })}
                          aria-label={`Edit ${item.name}`}
                        >
                          <Icon name="edit" className="ob-ico" />
                        </button>
                        <button
                          type="button" className="ob-x"
                          onClick={() => removeItem(category.id, item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Icon name="trash" className="ob-ico" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        <button type="button" className="ob-add" onClick={() => setNaming(true)}>
          <Icon name="plus" className="ob-ico" />
          Add a category
        </button>
      </div>

      {naming && (
        <Modal title="Add a category" onClose={() => { setNaming(false); setNewName(''); }}>
          <Field label="Category name" required htmlFor="ob-cat-name">
            <input
              id="ob-cat-name" type="text" className="ob-input" value={newName} autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
              placeholder="e.g. Starters"
            />
          </Field>
          <div className="ob-modal__foot">
            <button
              type="button" className="ob-ghost"
              onClick={() => { setNaming(false); setNewName(''); }}
            >
              Cancel
            </button>
            <button type="button" className="ob-go" onClick={addCategory} disabled={!newName.trim()}>
              Add category
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          wide
          title={editing.item ? 'Edit item' : isMeat ? 'Add a product' : 'Add an item'}
          onClose={() => setEditing(null)}
        >
          <ItemForm
            item={editing.item} isMeat={isMeat}
            onSave={saveItem} onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}

/* ── Uploaded sheet ──────────────────────────────────────────────────────── */

/* The sheet carries names and prices; the app also needs a picture of each
   dish, and asking for them here — against the rows we just read — is the
   only point where the partner can see which item each photo belongs to. */
export function MenuSheetTable({ rows, onImage }) {
  const withImage = rows.filter(row => row.image).length;

  return (
    <div className="ob-table">
      <div className="ob-table__head">
        <div>
          <strong>Item photos</strong>
          <p className="ob-hint">{withImage} of {rows.length} added</p>
        </div>
        <span className="ob-count">Required</span>
      </div>

      <div className="ob-table__scroll">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Item</th>
              <th>Price</th>
              <th>Type</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>{row.category || '—'}</td>
                <td className="ob-table__name">{row.itemName || '—'}</td>
                <td>{row.price || '—'}</td>
                <td>{row.type || '—'}</td>
                <td>
                  {row.image ? (
                    <span className="ob-photo ob-photo--sm">
                      <Icon name="image" className="ob-ico" />
                      <span>{row.image.name}</span>
                      <button
                        type="button" className="ob-x" onClick={() => onImage(row.id, null)}
                        aria-label={`Remove the photo for ${row.itemName || 'this item'}`}
                      >
                        <Icon name="close" className="ob-ico" />
                      </button>
                    </span>
                  ) : (
                    <label className="ob-ghost ob-ghost--sm">
                      <Icon name="image" className="ob-ico" />
                      Add photo
                      <input
                        type="file" accept="image/*" className="ob-file"
                        onChange={e => onImage(row.id, e.target.files?.[0] || null)}
                      />
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {withImage < rows.length && (
        <div className="ob-table__foot">
          <Note tone="warn" icon="alert">
            Every item needs a photo before this step can be finished.
          </Note>
        </div>
      )}
    </div>
  );
}
