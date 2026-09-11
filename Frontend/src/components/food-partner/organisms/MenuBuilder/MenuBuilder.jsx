import { useState } from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Field } from '../../molecules/Field/Field';
import { Modal } from '../Modal/Modal';
import { uid } from '../../../../lib/uid';
import { ItemForm } from '../ItemForm/ItemForm';
import { Box, Inline, Input, List, ListItem, PlainButton, Strong, Text } from '../../../common/atoms';

/* ══════════════════════════════════════════════════════════════════════════
   The menu, built by hand.

   Categories hold items; an item is a name, a price and the two flags that
   decide how it is shown in the app — veg or not, and whether it leads the
   listing. A meat centre uses the same structure for its counter, which is
   why the only thing `partnerType` changes here is wording.
   ══════════════════════════════════════════════════════════════════════════ */


export function MenuBuilder({ categories, onChange, isMeat, help, emptyTitle, emptyHelp }) {
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
      <Box className="ob-card">
        <Box className="ob-card__head">
          <Box>
            <Text className="ob-label">{isMeat ? 'Product categories & items' : 'Menu categories & items'}</Text>
            <Text className="ob-hint">{help}</Text>
          </Box>
          {itemCount > 0 && (
            <Inline className="ob-count">{itemCount} item{itemCount === 1 ? '' : 's'}</Inline>
          )}
        </Box>

        {categories.length === 0 ? (
          <Box className="ob-empty">
            <Icon name="menu" className="ob-ico ob-ico--xl" />
            <Strong>{emptyTitle}</Strong>
            <Text>{emptyHelp}</Text>
          </Box>
        ) : (
          <Box className="ob-cats">
            {categories.map(category => (
              <Box className="ob-cat" key={category.id}>
                <Box className="ob-cat__head">
                  <Box>
                    <Text className="ob-cat__name">{category.name}</Text>
                    <Text className="ob-hint">
                      {category.items.length} item{category.items.length === 1 ? '' : 's'}
                    </Text>
                  </Box>
                  <Box className="ob-cat__acts">
                    <PlainButton
                      type="button" className="ob-link"
                      onClick={() => setEditing({ categoryId: category.id })}
                    >
                      <Icon name="plus" className="ob-ico" />
                      Add item
                    </PlainButton>
                    <PlainButton
                      type="button" className="ob-x"
                      onClick={() => onChange(categories.filter(c => c.id !== category.id))}
                      aria-label={`Remove ${category.name}`}
                    >
                      <Icon name="trash" className="ob-ico" />
                    </PlainButton>
                  </Box>
                </Box>

                {category.items.length === 0 ? (
                  <Text className="ob-cat__empty">Nothing in here yet — add the first item.</Text>
                ) : (
                  <List className="ob-items">
                    {category.items.map(item => (
                      <ListItem className="ob-item" key={item.id}>
                        <Inline className={`ob-diet ob-diet--${item.isVeg ? 'veg' : 'nonveg'}`} />
                        <Box className="ob-item__body">
                          <Text className="ob-item__name">
                            {item.name}
                            {item.isBestseller && <Inline className="ob-star">Bestseller</Inline>}
                          </Text>
                          {item.description && <Text className="ob-hint">{item.description}</Text>}
                        </Box>
                        <Inline className="ob-item__price">₹{item.price}</Inline>
                        <PlainButton
                          type="button" className="ob-x"
                          onClick={() => setEditing({ categoryId: category.id, item })}
                          aria-label={`Edit ${item.name}`}
                        >
                          <Icon name="edit" className="ob-ico" />
                        </PlainButton>
                        <PlainButton
                          type="button" className="ob-x"
                          onClick={() => removeItem(category.id, item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Icon name="trash" className="ob-ico" />
                        </PlainButton>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            ))}
          </Box>
        )}

        <PlainButton type="button" className="ob-add" onClick={() => setNaming(true)}>
          <Icon name="plus" className="ob-ico" />
          Add a category
        </PlainButton>
      </Box>

      {naming && (
        <Modal title="Add a category" onClose={() => { setNaming(false); setNewName(''); }}>
          <Field label="Category name" required htmlFor="ob-cat-name">
            <Input
              id="ob-cat-name" type="text" className="ob-input" value={newName} autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
              placeholder="e.g. Starters"
            />
          </Field>
          <Box className="ob-modal__foot">
            <PlainButton
              type="button" className="ob-ghost"
              onClick={() => { setNaming(false); setNewName(''); }}
            >
              Cancel
            </PlainButton>
            <PlainButton type="button" className="ob-go" onClick={addCategory} disabled={!newName.trim()}>
              Add category
            </PlainButton>
          </Box>
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
