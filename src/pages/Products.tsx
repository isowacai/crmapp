import React, { useState, memo } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS } from '../lib/firebase';
import { Product } from '../types';
import { Package, Plus, Eye, Pencil, Trash2, X, LayoutGrid, List } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export default React