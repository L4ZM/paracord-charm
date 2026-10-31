# Paracord Charm

Generador web de charms con relieve por alturas desde PNG o SVG. Funciona en el navegador, sin servidor de procesamiento de imágenes.

## Funciones

- Carga de PNG y SVG, con reducción a un máximo de cuatro colores.
- Conservación del fondo o eliminación exterior por tolerancia y selección de color.
- Color y altura editables; validación de múltiplos de la altura de capa.
- Vista 3D mediante WebGL, tamaño y paso para el cordón.
- Exportación STL binaria y 3MF con cuerpos por tramo de altura y metadatos para laminadores de la familia Bambu/Orca.
- Tabla de cambios de filamento descargable.

## Usar

Abrir `dist/index.html` en un navegador moderno, o servir la carpeta `dist` con cualquier servidor de archivos estáticos. No requiere instalar dependencias.

Para un servidor local con Python:

```sh
python -m http.server 8000 --directory dist
```

Abrir http://localhost:8000.

## Pruebas

Con Node.js 18 o posterior:

```sh
npm test
```

Las pruebas comprueban mallas cerradas y orientación, conservación del volumen entre tramos, un agujero, tamaño del STL, generación 3MF, eliminación del fondo exterior y validación de alturas. Se generan archivos de prueba en `qa/`.

## Publicar

La aplicación es estática: publicar el contenido de `dist` en GitHub Pages u otro alojamiento estático. Esta copia no incluye la configuración del sitio privado de ChatGPT ni sus credenciales. Copiar a GitHub no cambia la publicación actual ni establece sincronización automática.

## Consideraciones

PNG y SVG se convierten a una rejilla de detalle ajustable; no se conserva la geometría vectorial exacta del SVG. La eliminación exterior depende del color conectado a los bordes y no reconoce objetos. Los SVG se sanitizan y no se admiten recursos externos o imágenes incrustadas.

Los archivos 3MF no contienen G-code ni un perfil completo de impresora. Seleccionar impresora, material y ranuras de filamento en el laminador; comprobar los cambios antes de imprimir. La importación en las aplicaciones reales de Bambu Studio y Flashforge sigue pendiente de verificación.

La página procesa los diseños localmente. La hoja de estilo solicita fuentes a Google Fonts; utiliza fuentes de reserva cuando no hay conexión.

## Archivos

- `dist/index.html`: interfaz en español.
- `dist/style.css`: estilos adaptables.
- `dist/app.js`: carga, controles y vista WebGL.
- `dist/engine.js`: tratamiento de imagen, geometría y exportación.
- `test-engine.cjs`: pruebas del motor.
