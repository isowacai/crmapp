import React from 'react';
import { X } from 'lucide-react';

const Modal = ({
  title,
  subtitle,
  onClose,
  children,
  width = 'max-w-2xl'
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className={`bg-white rounded-xl p-6 w-full ${width} max-h-[90vh] overflow-y-auto custom-scrollbar`}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="btn-icon text-gray-500" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export default Modal;
