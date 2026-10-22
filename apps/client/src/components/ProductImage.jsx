import React, { useState } from 'react';

// One portrait frame for menu photos, size selection and cart thumbnails.
export default function ProductImage({ product, className = '', children }) {
  const [failedSource, setFailedSource] = useState(null);
  const hasPhoto = product.imageUrl && failedSource !== product.imageUrl;

  return <div className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-[#0b0b0b] select-none ${className}`}>
    {hasPhoto ? <img
      src={product.imageUrl}
      alt={product.name}
      width="320"
      height="480"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedSource(product.imageUrl)}
      className="absolute inset-0 block h-full w-full object-cover object-center"
    /> : <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-4xl">{product.emoji || '🍽️'}</span>}
    {children}
  </div>;
}
