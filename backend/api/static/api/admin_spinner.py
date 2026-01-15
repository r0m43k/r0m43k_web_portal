/* Полупрозрачный оверлей */
#upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 9999;
  display: none;
  align-items: center;
  justify-content: center;
}

/* Сам блок спиннера */
#upload-overlay .box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 22px 26px;
  border-radius: 14px;
  background: rgba(25, 25, 25, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 14px;
}

/* Крутилка */
#upload-overlay .spinner {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.20);
  border-top-color: rgba(255, 255, 255, 0.95);
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
