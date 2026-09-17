import React from 'react';
import { useState } from 'react';
import { uid } from '../../../../lib/uid';
import { Field } from '../../molecules/Field/Field';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Box, Inline, Input, Label, PlainButton, TextArea } from '../../../common/atoms';

export function ItemForm({ item, isMeat, onSave, onCancel }) {
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
      <Box className="ob-grid ob-grid--2">
        <Field label={isMeat ? 'Product name' : 'Item name'} required htmlFor="ob-item-name">
          <Input
            id="ob-item-name" type="text" className="ob-input" value={name}
            onChange={e => setName(e.target.value)}
            placeholder={isMeat ? 'e.g. Chicken curry cut, 500g' : 'e.g. Butter chicken'}
          />
        </Field>
        <Field label="Price (₹)" required htmlFor="ob-item-price">
          <Input
            id="ob-item-price" type="text" inputMode="numeric" className="ob-input" value={price}
            onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 349"
          />
        </Field>
      </Box>

      <Field label="Description" optional htmlFor="ob-item-desc">
        <TextArea
          id="ob-item-desc" rows="2" className="ob-input" value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={isMeat
            ? 'e.g. Cleaned, cut and packed fresh each morning'
            : 'e.g. Creamy tomato gravy, cooked overnight'}
        />
      </Field>

      <Box className="ob-row">
        {!isMeat && (
          <Field label="Type">
            <Box className="ob-seg">
              <PlainButton
                type="button" onClick={() => setIsVeg(true)}
                className={`ob-seg__btn ob-seg__btn--veg${isVeg ? ' is-on' : ''}`}
              >
                <Inline className="ob-diet ob-diet--veg" />
                Veg
              </PlainButton>
              <PlainButton
                type="button" onClick={() => setIsVeg(false)}
                className={`ob-seg__btn ob-seg__btn--nonveg${!isVeg ? ' is-on' : ''}`}
              >
                <Inline className="ob-diet ob-diet--nonveg" />
                Non-veg
              </PlainButton>
            </Box>
          </Field>
        )}

        <Field label="Tags">
          <PlainButton
            type="button" onClick={() => setIsBestseller(v => !v)}
            className={`ob-seg__btn ob-seg__btn--star${isBestseller ? ' is-on' : ''}`}
          >
            <Icon name="flame" className="ob-ico" />
            {isMeat ? 'Featured' : 'Bestseller'}
          </PlainButton>
        </Field>
      </Box>

      <Field label={isMeat ? 'Product photo' : 'Item photo'} optional>
        {photo ? (
          <Box className="ob-photo">
            <Icon name="image" className="ob-ico" />
            <Inline>{photo.name}</Inline>
            <PlainButton type="button" className="ob-x" onClick={() => setPhoto(null)} aria-label="Remove photo">
              <Icon name="close" className="ob-ico" />
            </PlainButton>
          </Box>
        ) : (
          <Box className="ob-row ob-row--tight">
            <Label className="ob-ghost">
              <Icon name="image" className="ob-ico" />
              Upload a photo
              <Input
                type="file" accept="image/*" className="ob-file"
                onChange={e => setPhoto(e.target.files?.[0] || null)}
              />
            </Label>
            <PlainButton
              type="button" className="ob-ghost"
              onClick={() => setPhoto(new File(['sample photo'], 'item_photo_sample.png', { type: 'image/png' }))}
            >
              <Icon name="sparkle" className="ob-ico" />
              Use a sample
            </PlainButton>
          </Box>
        )}
      </Field>

      <Box className="ob-modal__foot">
        <PlainButton type="button" className="ob-ghost" onClick={onCancel}>Cancel</PlainButton>
        <PlainButton type="button" className="ob-go" onClick={save} disabled={!ready}>
          {item ? 'Update item' : isMeat ? 'Add product' : 'Add to menu'}
        </PlainButton>
      </Box>
    </>
  );
}
